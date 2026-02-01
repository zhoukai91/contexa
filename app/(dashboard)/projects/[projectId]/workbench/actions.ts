'use server';

import { prisma } from '@/lib/db/prisma';
import { requireProjectAccess } from '@/lib/auth/guards';
import { Prisma, TranslationStatus } from '@prisma/client';

const ROOT_MODULE_NAME = '__root__';

export type WorkbenchTreeNode = {
  id: string;
  type: 'page' | 'module';
  label: string;
  count: number;
  children?: WorkbenchTreeNode[];
  originalId: number;
};

export async function getWorkbenchTree(projectId: number): Promise<WorkbenchTreeNode[]> {
  await requireProjectAccess(projectId);

  const pages = await prisma.page.findMany({
    where: { projectId },
    include: {
      modules: true,
    },
    orderBy: { route: 'asc' }
  });

  const moduleCounts = await prisma.entryPlacement.groupBy({
    by: ['moduleId'],
    where: {
      module: { page: { projectId } }
    },
    _count: true
  });

  const moduleCountMap = new Map(moduleCounts.map((m) => [m.moduleId!, m._count]));

  const tree: WorkbenchTreeNode[] = pages.map((page) => {
    const pageCount = page.modules.reduce(
      (acc, mod) => acc + (moduleCountMap.get(mod.id) || 0),
      0
    );
    const visibleModules = page.modules.filter((m) => m.name !== ROOT_MODULE_NAME);

    const pageNode: WorkbenchTreeNode = {
      id: `page-${page.id}`,
      type: 'page',
      label: page.route + (page.title ? ` (${page.title})` : ''),
      count: pageCount,
      originalId: page.id,
      children: []
    };

    if (visibleModules.length > 0) {
      pageNode.children = visibleModules.map((mod) => ({
        id: `module-${mod.id}`,
        type: 'module',
        label: mod.name,
        count: moduleCountMap.get(mod.id) || 0,
        originalId: mod.id
      }));
    }
    return pageNode;
  });

  return tree;
}

export type WorkbenchFilterParams = {
  targetLocale: string;
  pageId?: number;
  moduleId?: number;
  search?: string;
  statuses?: TranslationStatus[];
  page?: number;
  pageSize?: number;
};

export type WorkbenchItem = {
  id: number;
  key: string;
  sourceText: string;
  targetText: string;
  status: TranslationStatus;
  translationId?: number;
  placements: {
    page: { route: string; title: string | null };
    module: { name: string } | null;
  }[];
};

export type WorkbenchDataResponse = {
  items: WorkbenchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getWorkbenchData(
  projectId: number,
  params: WorkbenchFilterParams
): Promise<WorkbenchDataResponse> {
  await requireProjectAccess(projectId);

  const { targetLocale, pageId, moduleId, search, statuses, page = 1, pageSize = 20 } = params;
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));

  const where: Prisma.EntryWhereInput = {
    projectId
  };

  if (moduleId) {
    where.placements = { some: { moduleId } };
  } else if (pageId) {
    where.placements = { some: { module: { pageId } } };
  }

  if (search && search.trim()) {
    const needle = search.trim();
    where.OR = [
      { key: { contains: needle } },
      { sourceText: { contains: needle } },
      {
        translations: {
          some: {
            locale: targetLocale,
            text: { contains: needle }
          }
        }
      }
    ];
  }

  if (statuses && statuses.length > 0) {
    const hasPending = statuses.includes('pending');
    const otherStatuses = statuses.filter((s) => s !== 'pending');

    const statusConditions: Prisma.EntryWhereInput[] = [];

    if (otherStatuses.length > 0) {
      statusConditions.push({
        translations: {
          some: {
            locale: targetLocale,
            status: { in: otherStatuses }
          }
        }
      });
    }

    if (hasPending) {
      statusConditions.push({
        OR: [
          { translations: { none: { locale: targetLocale } } },
          { translations: { some: { locale: targetLocale, status: 'pending' } } }
        ]
      });
    }

    if (statusConditions.length > 0) {
      if (where.OR) {
        where.AND = [
          { OR: where.OR },
          { OR: statusConditions }
        ];
        delete where.OR;
      } else {
        where.OR = statusConditions;
      }
    }
  }

  const total = await prisma.entry.count({ where });
  const totalPages = Math.ceil(total / safePageSize);

  const entries = await prisma.entry.findMany({
    where,
    skip: (safePage - 1) * safePageSize,
    take: safePageSize,
    include: {
      translations: {
        where: { locale: targetLocale },
        take: 1
      },
      placements: {
        include: { module: { include: { page: true } } }
      }
    },
    orderBy: { key: 'asc' }
  });

  const items: WorkbenchItem[] = entries.map((entry) => {
    const translation = entry.translations[0];
    return {
      id: entry.id,
      key: entry.key,
      sourceText: entry.sourceText,
      targetText: translation?.text ?? '',
      status: translation?.status || 'pending',
      translationId: translation?.id,
      placements: entry.placements
        .filter((p) => Boolean(p.module))
        .map((p) => ({
          page: { route: p.module!.page.route, title: p.module!.page.title },
          module: p.module!.name === ROOT_MODULE_NAME ? null : { name: p.module!.name }
        }))
    };
  });

  return {
    items,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages
  };
}

export async function getUserProjectLocalePreference(projectId: number): Promise<string | null> {
  const { user } = await requireProjectAccess(projectId);

  const pref = await prisma.userProjectLocalePreference.findFirst({
    where: { userId: user.id, projectId },
    orderBy: { updatedAt: 'desc' }
  });

  return pref?.locale || null;
}

export async function getProjectLocales(projectId: number): Promise<{ sourceLocale: string; locales: string[] } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { locales: true }
  });
  if (!project) return null;
  return { sourceLocale: project.sourceLocale, locales: project.locales.map((l) => l.locale) };
}

export async function saveTranslation(
  projectId: number,
  entryId: number,
  locale: string,
  text: string
) {
  await requireProjectAccess(projectId);

  const [entry, projectLocale] = await Promise.all([
    prisma.entry.findFirst({ where: { id: entryId, projectId }, select: { id: true } }),
    prisma.projectLocale.findUnique({
      where: { projectId_locale: { projectId, locale } },
      select: { id: true }
    })
  ]);
  if (!entry) {
    throw new Error('Entry not found');
  }
  if (!projectLocale) {
    throw new Error('Invalid locale');
  }

  const existing = await prisma.translation.findUnique({
    where: {
      entryId_locale: {
        entryId,
        locale
      }
    }
  });
  if (existing && existing.projectId !== projectId) {
    throw new Error('Translation project mismatch');
  }

  const status: TranslationStatus = 'ready';

  if (existing) {
    return await prisma.translation.update({
      where: { id: existing.id },
      data: {
        text,
        status
      }
    });
  }

  return await prisma.translation.create({
    data: {
      entryId,
      projectId,
      locale,
      text,
      status
    }
  });
}
