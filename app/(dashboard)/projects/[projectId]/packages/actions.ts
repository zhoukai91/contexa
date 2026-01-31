'use server';

import crypto from 'node:crypto';
import { z } from 'zod';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db/prisma';
import { getProjectPermissionChecker } from '@/lib/auth/project-permissions-server';
import { parseLanguagePack } from '@/lib/packages/language-pack-parser';
import { importSourcePack, importTargetPack } from '@/lib/packages/repo';

const projectIdSchema = z.coerce.number().int().positive();
const localeSchema = z.string().trim().min(1).max(20);

export type PackagesQueryResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type PackagesActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type PackagesBootstrap = {
  sourceLocale: string;
  targetLocales: string[];
  canManage: boolean;
  templateShape: 'flat' | 'tree';
};

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

async function upsertProjectTemplatePaths(projectId: number, incoming: string[][]) {
  const key = `project:${projectId}:langpack:template`;
  const existing = await getProjectTemplatePaths(projectId);
  const existingSet = new Set(existing.map((p) => p.join('.')));
  const next = [...existing];
  for (const path of incoming) {
    const signature = path.join('.');
    if (!signature) continue;
    if (existingSet.has(signature)) continue;
    existingSet.add(signature);
    next.push(path);
  }
  if (next.length === existing.length) return;
  const value = JSON.stringify(next);
  await prisma.systemMeta.upsert({
    where: { key },
    update: { value },
    create: { key, value, description: 'language pack template paths for export' }
  });
}

type PackageUploadDetails = {
  addedKeys: string[];
  updatedKeys: Array<{ key: string; before: string; after: string }>;
  ignoredKeys: string[];
  markedNeedsUpdateKeys: string[];
  pendingReviewKeys: string[];
  skippedEmptyKeys: string[];
  bindMode?: 'all' | 'addedOnly';
  boundPageId?: number;
  boundModuleId?: number | null;
  boundCount?: number;
  createdPageRoute?: string;
  createdModuleName?: string;
};

async function createPackageUploadRecord({
  projectId,
  locale,
  shape,
  createdByUserId,
  summary,
  details
}: {
  projectId: number;
  locale: string;
  shape: 'flat' | 'tree';
  createdByUserId: number | null;
  summary: {
    added: number;
    updated: number;
    missing: number;
    ignored: number;
    markedNeedsUpdate: number;
    skippedEmpty: number;
  };
  details: PackageUploadDetails;
}) {
  await (prisma as any).packageUpload.create({
    data: {
      projectId,
      locale,
      shape,
      createdByUserId,
      summaryAdded: summary.added,
      summaryUpdated: summary.updated,
      summaryMissing: summary.missing,
      summaryIgnored: summary.ignored,
      summaryMarkedNeedsUpdate: summary.markedNeedsUpdate,
      summarySkippedEmpty: summary.skippedEmpty,
      detailsJson: JSON.stringify(details)
    }
  });
}

async function enforcePackagesQualityGate(input: {
  projectId: number;
  scenario: 'save' | 'import' | 'export';
  locale?: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { qualityMode: true, sourceLocale: true }
  });
  if (!project) return { ok: false as const, error: '项目不存在' };
  if (project.qualityMode !== 'strict') return { ok: true as const };

  if (input.scenario === 'export' && input.locale && input.locale !== project.sourceLocale) {
    const blocked = await prisma.translation.count({
      where: {
        projectId: input.projectId,
        locale: input.locale,
        OR: [{ status: { not: 'approved' } }, { text: null }, { text: '' }]
      }
    });
    if (blocked > 0) {
      return {
        ok: false as const,
        error: `质量门禁：目标语言存在 ${blocked} 条未定版或空译文，禁止导出。`
      };
    }
  }

  return { ok: true as const };
}

export async function getPackagesBootstrapQuery(projectId: number): Promise<PackagesQueryResult<PackagesBootstrap>> {
  try {
    const { can } = await getProjectPermissionChecker(projectId, true);
    const canManage = can(['admin', 'creator']);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sourceLocale: true }
    });
    if (!project) return { ok: false, error: '项目不存在' };

    const locales = await prisma.projectLocale.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { locale: true }
    });

    const targetLocales = locales.map((l) => l.locale).filter((l) => l !== project.sourceLocale);

    const templateShape = await getProjectTemplateShape(projectId);
    return { ok: true, data: { sourceLocale: project.sourceLocale, targetLocales, canManage, templateShape } };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages bootstrap query failed', { debugId, projectId }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

export type PackagesEntryTranslation = {
  text: string;
  status: 'pending' | 'needs_update' | 'needs_review' | 'ready' | 'approved';
  updatedAt: string;
};

export type PackagesEntryPlacement = {
  pageRoute: string;
  pageTitle: string | null;
  moduleName: string | null;
};

export type PackagesEntry = {
  id: number;
  key: string;
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  translations: Record<string, PackagesEntryTranslation | undefined>;
  placementCount: number;
  hasMorePlacements: boolean;
  placement: PackagesEntryPlacement | null;
};

export type PackagesEntriesResult = {
  items: PackagesEntry[];
  total: number;
};

export async function listPackagesEntriesQuery(projectId: number): Promise<PackagesQueryResult<PackagesEntriesResult>> {
  try {
    await getProjectPermissionChecker(projectId);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sourceLocale: true }
    });
    if (!project) return { ok: false, error: '项目不存在' };

    const locales = await prisma.projectLocale.findMany({
      where: { projectId },
      select: { locale: true }
    });
    const targetLocales = locales.map((l) => l.locale).filter((l) => l !== project.sourceLocale);

    const entries = await prisma.entry.findMany({
      where: { projectId },
      orderBy: { key: 'asc' },
      select: {
        id: true,
        key: true,
        sourceText: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { placements: true } },
        placements: {
          take: 2,
          orderBy: { id: 'asc' },
          select: {
            page: { select: { route: true, title: true } },
            module: { select: { name: true } }
          }
        },
        translations: {
          where: { locale: { in: targetLocales } },
          select: { locale: true, text: true, status: true, updatedAt: true }
        }
      }
    });

    const items: PackagesEntry[] = entries.map((e) => {
      const translations: PackagesEntry['translations'] = {};
      for (const tr of e.translations) {
        translations[tr.locale] = {
          text: tr.text ?? '',
          status: tr.status,
          updatedAt: tr.updatedAt.toISOString()
        };
      }
      const placementCount = e._count.placements;
      const first = e.placements[0];
      return {
        id: e.id,
        key: e.key,
        sourceText: e.sourceText,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        translations,
        placementCount,
        hasMorePlacements: placementCount > 1,
        placement: first
          ? {
              pageRoute: first.page.route,
              pageTitle: first.page.title,
              moduleName: first.module?.name ?? null
            }
          : null
      };
    });

    return { ok: true, data: { items, total: items.length } };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages list entries query failed', { debugId, projectId }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

const entryIdSchema = z.coerce.number().int().positive();

export type PackagesEntryPlacementsResult = {
  items: PackagesEntryPlacement[];
};

export async function listPackagesEntryPlacementsQuery(
  input: { projectId: number; entryId: number }
): Promise<PackagesQueryResult<PackagesEntryPlacementsResult>> {
  try {
    const parsed = z
      .object({ projectId: projectIdSchema, entryId: entryIdSchema })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

    await getProjectPermissionChecker(parsed.data.projectId);

    const entry = await prisma.entry.findUnique({
      where: { id: parsed.data.entryId },
      select: { projectId: true }
    });
    if (!entry || entry.projectId !== parsed.data.projectId) {
      return { ok: false, error: '词条不存在' };
    }

    const placements = await prisma.entryPlacement.findMany({
      where: { entryId: parsed.data.entryId },
      orderBy: { id: 'asc' },
      select: {
        page: { select: { route: true, title: true } },
        module: { select: { name: true } }
      }
    });

    return {
      ok: true,
      data: {
        items: placements.map((p) => ({
          pageRoute: p.page.route,
          pageTitle: p.page.title,
          moduleName: p.module?.name ?? null
        }))
      }
    };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages list entry placements query failed', { debugId, input }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

const uploadIdSchema = z.coerce.number().int().positive();

export type PackagesUploadHistoryItem = {
  id: number;
  createdAt: string;
  locale: string;
  shape: 'flat' | 'tree';
  operator: string;
  summary: {
    added: number;
    updated: number;
    missing: number;
    ignored: number;
    markedNeedsUpdate: number;
    skippedEmpty: number;
  };
};

export type PackagesUploadHistoryResult = {
  items: PackagesUploadHistoryItem[];
  total: number;
};

export async function listPackagesUploadHistoryQuery(
  projectId: number
): Promise<PackagesQueryResult<PackagesUploadHistoryResult>> {
  try {
    await getProjectPermissionChecker(projectId);
    const rows = await (prisma as any).packageUpload.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { createdBy: { select: { name: true, email: true } } }
    });

    const items = rows.map((r: any) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      locale: r.locale,
      shape: (r.shape === 'tree' ? 'tree' : 'flat') as 'flat' | 'tree',
      operator: r.createdBy?.name || r.createdBy?.email || '—',
      summary: {
        added: r.summaryAdded ?? 0,
        updated: r.summaryUpdated ?? 0,
        missing: r.summaryMissing ?? 0,
        ignored: r.summaryIgnored ?? 0,
        markedNeedsUpdate: r.summaryMarkedNeedsUpdate ?? 0,
        skippedEmpty: r.summarySkippedEmpty ?? 0
      }
    })) as PackagesUploadHistoryItem[];

    return { ok: true, data: { items, total: items.length } };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages list upload history query failed', { debugId, projectId }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

export type PackagesUploadHistoryDetail = PackagesUploadHistoryItem & {
  details: PackageUploadDetails;
};

export async function getPackagesUploadHistoryDetailQuery(
  input: { projectId: number; uploadId: number }
): Promise<PackagesQueryResult<PackagesUploadHistoryDetail>> {
  try {
    const parsed = z
      .object({ projectId: projectIdSchema, uploadId: uploadIdSchema })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

    await getProjectPermissionChecker(parsed.data.projectId);
    const row = await (prisma as any).packageUpload.findUnique({
      where: { id: parsed.data.uploadId },
      include: { createdBy: { select: { name: true, email: true } } }
    });
    if (!row || row.projectId !== parsed.data.projectId) return { ok: false, error: '记录不存在' };

    let details: PackageUploadDetails = {
      addedKeys: [],
      updatedKeys: [],
      ignoredKeys: [],
      markedNeedsUpdateKeys: [],
      pendingReviewKeys: [],
      skippedEmptyKeys: []
    };
    if (row.detailsJson) {
      try {
        const parsedDetails = JSON.parse(row.detailsJson) as Partial<PackageUploadDetails>;
        details = {
          addedKeys: Array.isArray(parsedDetails.addedKeys) ? parsedDetails.addedKeys.filter((s) => typeof s === 'string') : [],
          updatedKeys: Array.isArray(parsedDetails.updatedKeys)
            ? parsedDetails.updatedKeys
                .filter((it) => it && typeof it.key === 'string')
                .map((it) => ({ key: String(it.key), before: String(it.before ?? ''), after: String(it.after ?? '') }))
            : [],
          ignoredKeys: Array.isArray(parsedDetails.ignoredKeys) ? parsedDetails.ignoredKeys.filter((s) => typeof s === 'string') : [],
          markedNeedsUpdateKeys: Array.isArray(parsedDetails.markedNeedsUpdateKeys)
            ? parsedDetails.markedNeedsUpdateKeys.filter((s) => typeof s === 'string')
            : [],
          pendingReviewKeys: Array.isArray(parsedDetails.pendingReviewKeys)
            ? parsedDetails.pendingReviewKeys.filter((s) => typeof s === 'string')
            : [],
          skippedEmptyKeys: Array.isArray(parsedDetails.skippedEmptyKeys)
            ? parsedDetails.skippedEmptyKeys.filter((s) => typeof s === 'string')
            : []
        };
      } catch {}
    }

    return {
      ok: true,
      data: {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        locale: row.locale,
        shape: (row.shape === 'tree' ? 'tree' : 'flat') as 'flat' | 'tree',
        operator: row.createdBy?.name || row.createdBy?.email || '—',
        summary: {
          added: row.summaryAdded ?? 0,
          updated: row.summaryUpdated ?? 0,
          missing: row.summaryMissing ?? 0,
          ignored: row.summaryIgnored ?? 0,
          markedNeedsUpdate: row.summaryMarkedNeedsUpdate ?? 0,
          skippedEmpty: row.summarySkippedEmpty ?? 0
        },
        details
      }
    };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages get upload history detail query failed', { debugId, input }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

export type PackagesContextPageNode = {
  id: number;
  route: string;
  title: string | null;
  modules: Array<{ id: number; name: string }>;
};

export type PackagesContextNodesResult = {
  pages: PackagesContextPageNode[];
};

export async function listPackagesContextNodesQuery(
  projectId: number
): Promise<PackagesQueryResult<PackagesContextNodesResult>> {
  try {
    await getProjectPermissionChecker(projectId);
    const pages = await prisma.page.findMany({
      where: { projectId },
      orderBy: { route: 'asc' },
      select: {
        id: true,
        route: true,
        title: true,
        modules: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }
      }
    });
    return { ok: true, data: { pages } };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages list context nodes query failed', { debugId, projectId }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

export async function checkPackagesEntryKeyQuery(input: {
  projectId: number;
  key: string;
}): Promise<PackagesQueryResult<{ available: boolean }>> {
  try {
    const parsed = z
      .object({ projectId: projectIdSchema, key: z.string().trim().min(1).max(200) })
      .safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };
    await getProjectPermissionChecker(parsed.data.projectId);
    const existing = await prisma.entry.findUnique({
      where: { projectId_key: { projectId: parsed.data.projectId, key: parsed.data.key } },
      select: { id: true }
    });
    return { ok: true, data: { available: !existing } };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages check entry key query failed', { debugId, input }, error);
    return { ok: false, error: `请求失败 (debugId: ${debugId})` };
  }
}

const createEntrySchema = z.object({
  projectId: projectIdSchema,
  key: z.string().trim().min(1).max(200),
  sourceText: z.string().trim().min(1).max(5000),
  targetLocale: localeSchema.optional(),
  targetText: z.string().trim().max(5000).optional(),
  pageId: z.coerce.number().int().positive().optional(),
  moduleId: z.coerce.number().int().positive().optional()
});

export async function createPackagesEntryAction(
  input: z.infer<typeof createEntrySchema>
): Promise<PackagesActionResult<{ id: number }>> {
  let userId: number | null = null;
  try {
    const parsed = createEntrySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

    const { user, can } = await getProjectPermissionChecker(parsed.data.projectId, true);
    userId = user.id;
    if (!can(['admin', 'creator'])) return { ok: false, error: '无权限执行新增操作' };

    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { sourceLocale: true }
    });
    if (!project) return { ok: false, error: '项目不存在' };

    const gate = await enforcePackagesQualityGate({ projectId: parsed.data.projectId, scenario: 'save' });
    if (!gate.ok) return { ok: false, error: gate.error };

    const locales = await prisma.projectLocale.findMany({
      where: { projectId: parsed.data.projectId },
      select: { locale: true }
    });
    const targetLocales = locales.map((l) => l.locale).filter((l) => l !== project.sourceLocale);

    const pageId = parsed.data.pageId;
    const moduleId = parsed.data.moduleId;
    if (pageId) {
      const page = await prisma.page.findUnique({
        where: { id: pageId },
        select: { id: true, projectId: true }
      });
      if (!page || page.projectId !== parsed.data.projectId) return { ok: false, error: '页面不存在' };
      if (moduleId) {
        const module = await prisma.module.findUnique({
          where: { id: moduleId },
          select: { id: true, pageId: true }
        });
        if (!module || module.pageId !== pageId) return { ok: false, error: '模块不存在' };
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const entry = await tx.entry.create({
        data: {
          projectId: parsed.data.projectId,
          key: parsed.data.key,
          sourceText: parsed.data.sourceText,
          sourceLocale: project.sourceLocale
        },
        select: { id: true }
      });

      if (targetLocales.length) {
        await tx.translation.createMany({
          data: targetLocales.map((locale) => ({
            entryId: entry.id,
            projectId: parsed.data.projectId,
            locale,
            text:
              parsed.data.targetLocale === locale && parsed.data.targetText?.trim()
                ? parsed.data.targetText.trim()
                : null,
            status:
              parsed.data.targetLocale === locale && parsed.data.targetText?.trim()
                ? 'needs_review'
                : 'pending'
          }))
        });
      }

      if (pageId) {
        await tx.entryPlacement.create({
          data: { entryId: entry.id, pageId, moduleId: moduleId ?? null }
        });
      }

      return entry;
    });

    return { ok: true, data: { id: created.id } };
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { ok: false, error: 'key 已存在：请修改 key 或重新生成。' };
    }
    const debugId = crypto.randomUUID();
    console.error('projectPackages create entry failed', { debugId, userId }, error);
    return { ok: false, error: `新增失败 (debugId: ${debugId})` };
  }
}

const importBindSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['all', 'addedOnly']).default('all'),
  pageId: z.coerce.number().int().positive().optional(),
  moduleId: z.coerce.number().int().positive().optional()
});

const importCreateContextSchema = z.object({
  page: z
    .object({
      route: z.string().trim().min(1).max(200),
      title: z.string().trim().max(200).optional()
    })
    .optional(),
  module: z
    .object({
      name: z.string().trim().min(1).max(200)
    })
    .optional()
});

const importSchema = z.object({
  projectId: projectIdSchema,
  locale: localeSchema,
  rawJson: z.string().min(1).max(5_000_000),
  bind: importBindSchema.optional(),
  createContext: importCreateContextSchema.optional()
});

type ImportBindSummary = {
  pageId: number;
  moduleId: number | null;
  boundCount: number;
  mode: 'all' | 'addedOnly';
  createdPage: boolean;
  createdModule: boolean;
};

export type ImportLanguagePackResult =
  | {
      kind: 'source';
      shape: 'flat' | 'tree';
      summary: { added: number; updated: number; markedNeedsUpdate: number };
      bind?: ImportBindSummary;
    }
  | {
      kind: 'target';
      shape: 'flat' | 'tree';
      summary: { updated: number; ignored: number; skippedEmpty: number };
      bind?: ImportBindSummary;
    };

/** Splits a list into chunks to avoid oversized SQL `IN (...)` clauses. */
function chunkArray<T>(items: T[], chunkSize: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

/** Resolves (and optionally creates) the page/module context target for an import binding. */
async function resolveImportBindTarget(input: {
  projectId: number;
  bind: z.infer<typeof importBindSchema>;
  createContext?: z.infer<typeof importCreateContextSchema>;
}): Promise<
  | {
      pageId: number;
      moduleId: number | null;
      createdPage: boolean;
      createdModule: boolean;
      createdPageRoute?: string;
      createdModuleName?: string;
    }
  | { error: string }
> {
  const wantBind = input.bind.enabled;
  if (!wantBind) return { error: '绑定参数错误：enabled=false' };

  const createPage = input.createContext?.page;
  const createModule = input.createContext?.module;

  let pageId: number | null = null;
  let createdPage = false;
  let createdPageRoute: string | undefined;
  if (typeof input.bind.pageId === 'number') {
    const page = await prisma.page.findFirst({
      where: { id: input.bind.pageId, projectId: input.projectId },
      select: { id: true }
    });
    if (!page) return { error: '页面不存在' };
    pageId = page.id;
  } else if (createPage) {
    const route = createPage.route.trim();
    const existing = await prisma.page.findFirst({
      where: { projectId: input.projectId, route },
      select: { id: true }
    });
    if (existing) {
      pageId = existing.id;
    } else {
      try {
        const created = await prisma.page.create({
          data: {
            projectId: input.projectId,
            route,
            title: createPage.title?.trim() ? createPage.title.trim() : null,
            description: null
          },
          select: { id: true }
        });
        pageId = created.id;
        createdPage = true;
        createdPageRoute = route;
      } catch (error: any) {
        if (error?.code === 'P2002') return { error: '页面路由/标识冲突，请修改后重试。' };
        return { error: '创建页面失败' };
      }
    }
  } else {
    return { error: '请选择页面或填写新建页面信息。' };
  }

  let moduleId: number | null = null;
  let createdModule = false;
  let createdModuleName: string | undefined;
  if (typeof input.bind.moduleId === 'number') {
    const mod = await prisma.module.findFirst({
      where: { id: input.bind.moduleId, pageId },
      select: { id: true }
    });
    if (!mod) return { error: '模块不存在' };
    moduleId = mod.id;
  } else if (createModule) {
    const name = createModule.name.trim();
    const existing = await prisma.module.findFirst({
      where: { pageId, name },
      select: { id: true }
    });
    if (existing) {
      moduleId = existing.id;
    } else {
      try {
        const created = await prisma.module.create({
          data: { pageId, name, description: null },
          select: { id: true }
        });
        moduleId = created.id;
        createdModule = true;
        createdModuleName = name;
      } catch {
        return { error: '创建模块失败' };
      }
    }
  }

  return { pageId, moduleId, createdPage, createdModule, createdPageRoute, createdModuleName };
}

/** Ensures placements exist for the given entry ids, returning how many were inserted. */
async function ensureEntryPlacements(input: {
  pageId: number;
  moduleId: number | null;
  entryIds: number[];
}): Promise<number> {
  const entryIds = Array.from(new Set(input.entryIds));
  if (entryIds.length === 0) return 0;

  if (typeof input.moduleId === 'number') {
    let inserted = 0;
    for (const chunk of chunkArray(entryIds, 1000)) {
      const existing = await prisma.entryPlacement.findMany({
        where: { pageId: input.pageId, moduleId: input.moduleId, entryId: { in: chunk } },
        select: { entryId: true }
      });
      const existingSet = new Set(existing.map((p) => p.entryId));
      const missing = chunk.filter((id) => !existingSet.has(id));
      if (missing.length === 0) continue;
      const res = await prisma.entryPlacement.createMany({
        data: missing.map((entryId) => ({ entryId, pageId: input.pageId, moduleId: input.moduleId }))
      });
      inserted += res.count;
    }
    return inserted;
  }

  let inserted = 0;
  for (const chunk of chunkArray(entryIds, 1000)) {
    const existing = await prisma.entryPlacement.findMany({
      where: { pageId: input.pageId, moduleId: null, entryId: { in: chunk } },
      select: { entryId: true }
    });
    const existingSet = new Set(existing.map((p) => p.entryId));
    const missing = chunk.filter((id) => !existingSet.has(id));
    if (missing.length === 0) continue;
    const res = await prisma.entryPlacement.createMany({
      data: missing.map((entryId) => ({ entryId, pageId: input.pageId, moduleId: null }))
    });
    inserted += res.count;
  }
  return inserted;
}

export async function importLanguagePackAction(
  input: z.infer<typeof importSchema>
): Promise<PackagesActionResult<ImportLanguagePackResult>> {
  let userId: number | null = null;
  try {
    const parsed = importSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

    const { user, can } = await getProjectPermissionChecker(parsed.data.projectId, true);
    userId = user.id;
    if (!can(['admin', 'creator'])) return { ok: false, error: '无权限执行导入操作' };

    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { sourceLocale: true }
    });
    if (!project) return { ok: false, error: '项目不存在' };

    const gate = await enforcePackagesQualityGate({
      projectId: parsed.data.projectId,
      scenario: 'import',
      locale: parsed.data.locale
    });
    if (!gate.ok) return { ok: false, error: gate.error };

    const locales = await prisma.projectLocale.findMany({
      where: { projectId: parsed.data.projectId },
      select: { locale: true }
    });
    const localeSet = new Set(locales.map((l) => l.locale));

    if (parsed.data.locale !== project.sourceLocale && !localeSet.has(parsed.data.locale)) {
      return { ok: false, error: '导入语言不在项目语言范围内' };
    }

    const parsedPack = parseLanguagePack(parsed.data.rawJson);
    if (!parsedPack.ok) return { ok: false, error: parsedPack.error };
    if (parsedPack.data.drafts.length > 50_000) {
      return { ok: false, error: '文件过大：单次导入最多支持 50,000 条。' };
    }

    const bindInput = parsed.data.bind && parsed.data.bind.enabled ? parsed.data.bind : null;
    const effectiveBindMode: 'all' | 'addedOnly' =
      parsed.data.locale === project.sourceLocale ? (bindInput?.mode ?? 'all') : 'all';
    const bindTarget =
      bindInput && bindInput.enabled
        ? await resolveImportBindTarget({
            projectId: parsed.data.projectId,
            bind: { ...bindInput, mode: effectiveBindMode },
            createContext: parsed.data.createContext
          })
        : null;
    if (bindTarget && 'error' in bindTarget) return { ok: false, error: bindTarget.error };

    if (parsed.data.locale === project.sourceLocale) {
      const targetLocales = Array.from(localeSet).filter((l) => l !== project.sourceLocale);
      const incomingMap = parsedPack.data.map;
      const incomingKeys = Object.keys(incomingMap);

      const existingIncoming = incomingKeys.length
        ? await prisma.entry.findMany({
            where: { projectId: parsed.data.projectId, key: { in: incomingKeys } },
            select: { id: true, key: true, sourceText: true }
          })
        : [];
      const existingByKey = new Map(existingIncoming.map((e) => [e.key, e] as const));

      const addedKeys = incomingKeys.filter((k) => !existingByKey.has(k));
      const updatedKeys = existingIncoming
        .map((e) => {
          const after = incomingMap[e.key] ?? '';
          if (e.sourceText === after) return null;
          return { key: e.key, before: e.sourceText, after, entryId: e.id };
        })
        .filter(Boolean) as Array<{ key: string; before: string; after: string; entryId: number }>;

      const updatedEntryIds = updatedKeys.map((u) => u.entryId);
      const markedNeedsUpdateKeys =
        updatedEntryIds.length && targetLocales.length
          ? Array.from(
              new Set(
                (
                  await prisma.translation.findMany({
                    where: {
                      projectId: parsed.data.projectId,
                      entryId: { in: updatedEntryIds },
                      locale: { in: targetLocales },
                      status: { not: 'needs_update' },
                      NOT: [{ text: null }, { text: '' }]
                    },
                    select: { entry: { select: { key: true } } }
                  })
                ).map((r) => r.entry.key)
              )
            )
          : [];

      const missing =
        incomingKeys.length === 0
          ? 0
          : await prisma.entry.count({
              where: { projectId: parsed.data.projectId, key: { notIn: incomingKeys } }
            });

      const summary = await importSourcePack(prisma, {
        projectId: parsed.data.projectId,
        sourceLocale: project.sourceLocale,
        targetLocales,
        drafts: parsedPack.data.drafts
      });

      const shapeKey = `project:${parsed.data.projectId}:langpack:shape`;
      const existingShape = await prisma.systemMeta.findUnique({ where: { key: shapeKey } });
      if (!existingShape) {
        await prisma.systemMeta.create({
          data: { key: shapeKey, value: parsedPack.data.shape, description: 'language pack structure shape for export' }
        });
      }
      if ((existingShape?.value ?? parsedPack.data.shape) === 'tree' && parsedPack.data.shape === 'tree') {
        await upsertProjectTemplatePaths(
          parsed.data.projectId,
          parsedPack.data.drafts.map((d) => d.originalPath)
        );
      }

      let bind: ImportBindSummary | undefined;
      if (bindInput && bindTarget && !('error' in bindTarget)) {
        const keysToBind = effectiveBindMode === 'addedOnly' ? addedKeys : incomingKeys;

        const addedEntryIds: number[] = [];
        for (const chunk of chunkArray(addedKeys, 1000)) {
          const rows = await prisma.entry.findMany({
            where: { projectId: parsed.data.projectId, key: { in: chunk } },
            select: { id: true }
          });
          addedEntryIds.push(...rows.map((r) => r.id));
        }

        const entryIds =
          effectiveBindMode === 'addedOnly'
            ? addedEntryIds
            : [...existingIncoming.map((e) => e.id), ...addedEntryIds];

        const boundCount =
          keysToBind.length === 0
            ? 0
            : await ensureEntryPlacements({
                pageId: bindTarget.pageId,
                moduleId: bindTarget.moduleId,
                entryIds
              });

        bind = {
          pageId: bindTarget.pageId,
          moduleId: bindTarget.moduleId,
          boundCount,
          mode: effectiveBindMode,
          createdPage: bindTarget.createdPage,
          createdModule: bindTarget.createdModule
        };
      }

      if (incomingKeys.length) {
        await createPackageUploadRecord({
          projectId: parsed.data.projectId,
          locale: parsed.data.locale,
          shape: parsedPack.data.shape,
          createdByUserId: userId,
          summary: {
            added: addedKeys.length,
            updated: updatedKeys.length,
            missing,
            ignored: 0,
            markedNeedsUpdate: markedNeedsUpdateKeys.length,
            skippedEmpty: 0
          },
          details: {
            addedKeys,
            updatedKeys: updatedKeys.map(({ key, before, after }) => ({ key, before, after })),
            ignoredKeys: [],
            markedNeedsUpdateKeys,
            pendingReviewKeys: [],
            skippedEmptyKeys: [],
            bindMode: bind?.mode,
            boundPageId: bind?.pageId,
            boundModuleId: bind?.moduleId ?? null,
            boundCount: bind?.boundCount,
            createdPageRoute: bindTarget && !('error' in bindTarget) ? bindTarget.createdPageRoute : undefined,
            createdModuleName: bindTarget && !('error' in bindTarget) ? bindTarget.createdModuleName : undefined
          }
        });
      }

      return { ok: true, data: { kind: 'source', shape: parsedPack.data.shape, summary, bind } };
    }

    const t = await getTranslations('projectPackages');
    const targetLocales = Array.from(localeSet).filter((l) => l !== project.sourceLocale);
    if (!targetLocales.includes(parsed.data.locale)) {
      return { ok: false, error: t('emptyTargetLocalesTitle') };
    }

    const summary = await importTargetPack(prisma, {
      projectId: parsed.data.projectId,
      locale: parsed.data.locale,
      drafts: parsedPack.data.drafts
    });

    const incomingMap = parsedPack.data.map;
    const incomingKeys = Object.keys(incomingMap);
    const existingIncoming = incomingKeys.length
      ? await prisma.entry.findMany({
          where: { projectId: parsed.data.projectId, key: { in: incomingKeys } },
          select: { id: true, key: true }
        })
      : [];
    const entryIdByKey = new Map(existingIncoming.map((e) => [e.key, e.id] as const));

    const ignoredKeys = incomingKeys.filter((k) => !entryIdByKey.has(k));
    const skippedEmptyKeys = parsedPack.data.drafts
      .filter((d) => !d.value?.trim())
      .map((d) => d.key)
      .filter((k) => entryIdByKey.has(k));

    const existingTranslations = existingIncoming.length
      ? await prisma.translation.findMany({
          where: {
            projectId: parsed.data.projectId,
            locale: parsed.data.locale,
            entryId: { in: existingIncoming.map((e) => e.id) }
          },
          select: { entryId: true, text: true, entry: { select: { key: true } } }
        })
      : [];
    const beforeByKey = new Map(existingTranslations.map((tr) => [tr.entry.key, tr.text ?? ''] as const));

    const updatedKeys = incomingKeys
      .filter((k) => entryIdByKey.has(k))
      .map((k) => {
        const after = incomingMap[k] ?? '';
        if (!after.trim()) return null;
        const before = beforeByKey.get(k) ?? '';
        if (before === after) return null;
        return { key: k, before, after };
      })
      .filter(Boolean) as Array<{ key: string; before: string; after: string }>;

    const missing =
      incomingKeys.length === 0
        ? 0
        : await prisma.entry.count({
            where: { projectId: parsed.data.projectId, key: { notIn: incomingKeys } }
          });

    let bind: ImportBindSummary | undefined;
    if (bindInput && bindTarget && !('error' in bindTarget)) {
      const boundCount = await ensureEntryPlacements({
        pageId: bindTarget.pageId,
        moduleId: bindTarget.moduleId,
        entryIds: existingIncoming.map((e) => e.id)
      });
      bind = {
        pageId: bindTarget.pageId,
        moduleId: bindTarget.moduleId,
        boundCount,
        mode: effectiveBindMode,
        createdPage: bindTarget.createdPage,
        createdModule: bindTarget.createdModule
      };
    }

    if (incomingKeys.length) {
      await createPackageUploadRecord({
        projectId: parsed.data.projectId,
        locale: parsed.data.locale,
        shape: parsedPack.data.shape,
        createdByUserId: userId,
        summary: {
          added: 0,
          updated: updatedKeys.length,
          missing,
          ignored: ignoredKeys.length,
          markedNeedsUpdate: 0,
          skippedEmpty: skippedEmptyKeys.length
        },
        details: {
          addedKeys: [],
          updatedKeys,
          ignoredKeys,
          markedNeedsUpdateKeys: [],
          pendingReviewKeys: updatedKeys.map((u) => u.key),
          skippedEmptyKeys,
          bindMode: bind?.mode,
          boundPageId: bind?.pageId,
          boundModuleId: bind?.moduleId ?? null,
          boundCount: bind?.boundCount,
          createdPageRoute: bindTarget && !('error' in bindTarget) ? bindTarget.createdPageRoute : undefined,
          createdModuleName: bindTarget && !('error' in bindTarget) ? bindTarget.createdModuleName : undefined
        }
      });
    }

    return { ok: true, data: { kind: 'target', shape: parsedPack.data.shape, summary, bind } };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages import failed', { debugId, userId }, error);
    return { ok: false, error: `导入失败 (debugId: ${debugId})` };
  }
}

const exportSchema = z.object({
  projectId: projectIdSchema,
  locale: localeSchema,
  mode: z.enum(['empty', 'fallback', 'filled'])
});

export type ExportLanguagePackResult = {
  fileName: string;
  content: string;
};

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

export async function exportLanguagePackAction(
  input: z.infer<typeof exportSchema>
): Promise<PackagesActionResult<ExportLanguagePackResult>> {
  try {
    const parsed = exportSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

    await getProjectPermissionChecker(parsed.data.projectId);

    const project = await prisma.project.findUnique({
      where: { id: parsed.data.projectId },
      select: { sourceLocale: true }
    });
    if (!project) return { ok: false, error: '项目不存在' };

    const locales = await prisma.projectLocale.findMany({
      where: { projectId: parsed.data.projectId },
      select: { locale: true }
    });
    const localeSet = new Set(locales.map((l) => l.locale));
    if (parsed.data.locale !== project.sourceLocale && !localeSet.has(parsed.data.locale)) {
      return { ok: false, error: '导出语言不在项目语言范围内' };
    }

    const gate = await enforcePackagesQualityGate({
      projectId: parsed.data.projectId,
      scenario: 'export',
      locale: parsed.data.locale
    });
    if (!gate.ok) return { ok: false, error: gate.error };

    const entries = await prisma.entry.findMany({
      where: { projectId: parsed.data.projectId },
      orderBy: { key: 'asc' },
      select: {
        key: true,
        sourceText: true,
        translations: {
          where: { locale: parsed.data.locale },
          select: { text: true }
        }
      }
    });

    const isSource = parsed.data.locale === project.sourceLocale;
    const outMap: Record<string, string> = {};
    for (const e of entries) {
      if (isSource) {
        outMap[e.key] = e.sourceText;
        continue;
      }
      const tr = e.translations[0];
      const hasText = Boolean(tr?.text?.trim());
      if (parsed.data.mode === 'filled' && !hasText) continue;
      if (hasText) outMap[e.key] = tr!.text as string;
      else outMap[e.key] = parsed.data.mode === 'fallback' ? e.sourceText : '';
    }

    const shape = await getProjectTemplateShape(parsed.data.projectId);
    if (shape === 'flat') {
      return {
        ok: true,
        data: {
          fileName: `project-${parsed.data.projectId}.${parsed.data.locale}.json`,
          content: JSON.stringify(outMap, null, 2)
        }
      };
    }

    const templatePaths = await getProjectTemplatePaths(parsed.data.projectId);
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

    return {
      ok: true,
      data: {
        fileName: `project-${parsed.data.projectId}.${parsed.data.locale}.json`,
        content: JSON.stringify(tree, null, 2)
      }
    };
  } catch (error) {
    const debugId = crypto.randomUUID();
    console.error('projectPackages export failed', { debugId }, error);
    return { ok: false, error: `导出失败 (debugId: ${debugId})` };
  }
}
