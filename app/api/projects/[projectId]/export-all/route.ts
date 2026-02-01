import JSZip from 'jszip';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { AuthError, requireApiUser } from '@/lib/auth/guards';
import { forbidden, fromUnknownError, notFound, unauthorized, validationError } from '@/lib/http/response';

export const runtime = 'nodejs';
const projectIdSchema = z.coerce.number().int().positive();

async function requireApiProjectAccess(projectId: number) {
  const user = await requireApiUser();
  if (user.isSystemAdmin) return { user, member: null as any };

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } }
  });
  if (!member) {
    throw new AuthError('Forbidden', 403);
  }
  return { user, member };
}

async function getProjectTemplateShape(projectId: number): Promise<'flat' | 'tree'> {
  const key = `project:${projectId}:langpack:shape`;
  const meta = await prisma.systemMeta.findUnique({ where: { key } });
  return meta?.value === 'tree' ? 'tree' : 'flat';
}

async function getProjectTemplatePaths(projectId: number): Promise<string[][]> {
  const key = `project:${projectId}:langpack:template`;
  const meta = await prisma.systemMeta.findUnique({ where: { key } });
  if (!meta?.value) return [];
  try {
    const parsed = JSON.parse(meta.value) as string[][];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => Array.isArray(p) && p.every((s) => typeof s === 'string'));
  } catch {
    return [];
  }
}

function setPathValue(target: Record<string, unknown>, path: string[], value: string) {
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < path.length; i += 1) {
    const seg = path[i];
    if (!seg) return;
    if (i === path.length - 1) {
      cursor[seg] = value;
      return;
    }
    const next = cursor[seg];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }
}

function buildTreeJson(outMap: Record<string, string>, templatePaths: string[][]) {
  const fallbackPaths = Object.keys(outMap).map((k) => k.split('.'));
  const paths = templatePaths.length > 0 ? templatePaths : fallbackPaths;

  const tree: Record<string, unknown> = {};
  for (const path of paths) {
    const key = path.join('.');
    if (!key) continue;
    const value = outMap[key] ?? '';
    setPathValue(tree, path, value);
  }

  for (const key of Object.keys(outMap)) {
    if (paths.some((p) => p.join('.') === key)) continue;
    setPathValue(tree, key.split('.'), outMap[key]);
  }

  return JSON.stringify(tree, null, 2);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const parsed = projectIdSchema.safeParse(projectId);
    if (!parsed.success) {
      return validationError('Validation error', { projectId: ['Invalid projectId'] });
    }
    const id = parsed.data;

    const modeParam = new URL(request.url).searchParams.get('mode') || '';
    const mode = modeParam === 'empty' || modeParam === 'filled' || modeParam === 'fallback' ? modeParam : 'fallback';

    await requireApiProjectAccess(id);

    const project = await prisma.project.findUnique({
      where: { id },
      select: { sourceLocale: true, qualityMode: true }
    });
    if (!project) return notFound('项目不存在');

    const localeRows = await prisma.projectLocale.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
      select: { locale: true }
    });
    const localeSet = new Set(localeRows.map((l) => l.locale));
    localeSet.add(project.sourceLocale);
    const locales = Array.from(localeSet);

    const templateShape = await getProjectTemplateShape(id);
    const templatePaths = templateShape === 'tree' ? await getProjectTemplatePaths(id) : [];

    if (project.qualityMode === 'strict') {
      for (const locale of locales) {
        if (locale === project.sourceLocale) continue;
        const blocked = await prisma.translation.count({
          where: {
            projectId: id,
            locale,
            OR: [{ status: { not: 'approved' } }, { text: null }, { text: '' }]
          }
        });
        if (blocked > 0) {
          return validationError(`质量门禁：目标语言 ${locale} 存在 ${blocked} 条未定版或空译文，禁止导出。`);
        }
      }
    }

    const entries = await prisma.entry.findMany({
      where: { projectId: id },
      orderBy: { key: 'asc' },
      select: {
        key: true,
        sourceText: true,
        translations: {
          where: { locale: { in: locales } },
          select: { locale: true, text: true }
        }
      }
    });

    const zip = new JSZip();
    for (const locale of locales) {
      const outMap: Record<string, string> = {};
      const isSource = locale === project.sourceLocale;

      for (const e of entries) {
        if (isSource) {
          outMap[e.key] = e.sourceText;
          continue;
        }
        const tr = e.translations.find((t) => t.locale === locale);
        const text = tr?.text ?? '';
        const hasText = Boolean(text.trim());
        if (mode === 'filled' && !hasText) continue;
        if (hasText) outMap[e.key] = text;
        else outMap[e.key] = mode === 'fallback' ? e.sourceText : '';
      }

      const content =
        templateShape === 'tree' ? buildTreeJson(outMap, templatePaths) : JSON.stringify(outMap, null, 2);

      zip.file(`project-${id}.${locale}.json`, content);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const fileName = `project-${id}.langpacks.zip`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${fileName}"`
      }
    });
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.status === 403) return forbidden(err.message);
      if (err.status === 401) return unauthorized(err.message);
      return validationError(err.message);
    }
    return fromUnknownError(err);
  }
}
