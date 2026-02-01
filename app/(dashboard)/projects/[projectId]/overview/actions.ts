'use server';

import { prisma } from '@/lib/db/prisma';
import { requireProjectAccess } from '@/lib/auth/guards';
import { getProjectLocaleLabel } from '@/lib/locales';
import type { TranslationStatus } from '@prisma/client';

export type ProjectOverviewStats = {
  globalProgress: number;
  pendingReview: number;
  missing: number;
};

export type ProjectOverviewLocaleStat = {
  locale: string;
  label: string;
  progress: number;
  translatedCount: number;
  reviewCount: number;
  missingCount: number;
  lastActivity: string | null;
};

export type ProjectOverviewData = {
  project: {
    id: number;
    name: string;
    description: string | null;
    sourceLocale: string;
    targetLocales: string[];
    totalKeys: number;
  };
  stats: ProjectOverviewStats;
  localeStats: ProjectOverviewLocaleStat[];
};

export type ProjectOverviewRecentEntry = {
  key: string;
  source: string;
  status: '待翻译' | '待验收' | '已完成';
  locale: string;
  updatedAt: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapCountByLocale(rows: Array<{ locale: string; _count: { _all: number } }>) {
  return new Map(rows.map((r) => [r.locale, r._count._all]));
}

export async function getProjectOverviewQuery(projectId: number): Promise<ProjectOverviewData | null> {
  await requireProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, description: true, sourceLocale: true }
  });
  if (!project) return null;

  const [locales, totalKeys] = await Promise.all([
    prisma.projectLocale.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: { locale: true }
    }),
    prisma.entry.count({ where: { projectId } })
  ]);

  const targetLocales = locales.map((l) => l.locale).filter((l) => l !== project.sourceLocale);

  if (targetLocales.length === 0) {
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description ?? null,
        sourceLocale: project.sourceLocale,
        targetLocales: [],
        totalKeys
      },
      stats: {
        globalProgress: 100,
        pendingReview: 0,
        missing: 0
      },
      localeStats: []
    };
  }

  const reviewStatuses: TranslationStatus[] = ['needs_review', 'ready', 'needs_update'];

  const [translatedCounts, reviewCounts, missingCounts, lastActivityRows] = await Promise.all([
    prisma.translation.groupBy({
      by: ['locale'],
      where: {
        projectId,
        locale: { in: targetLocales },
        NOT: [{ text: null }, { text: '' }]
      },
      _count: { _all: true }
    }),
    prisma.translation.groupBy({
      by: ['locale'],
      where: {
        projectId,
        locale: { in: targetLocales },
        status: { in: reviewStatuses },
        NOT: [{ text: null }, { text: '' }]
      },
      _count: { _all: true }
    }),
    prisma.translation.groupBy({
      by: ['locale'],
      where: {
        projectId,
        locale: { in: targetLocales },
        OR: [{ status: 'pending' }, { text: null }, { text: '' }]
      },
      _count: { _all: true }
    }),
    prisma.translation.groupBy({
      by: ['locale'],
      where: { projectId, locale: { in: targetLocales } },
      _max: { updatedAt: true }
    })
  ]);

  const translatedByLocale = mapCountByLocale(translatedCounts);
  const reviewByLocale = mapCountByLocale(reviewCounts);
  const missingByLocale = mapCountByLocale(missingCounts);
  const lastActivityByLocale = new Map(
    lastActivityRows.map((r) => [r.locale, r._max.updatedAt ? r._max.updatedAt.toISOString() : null])
  );

  const localeStats: ProjectOverviewLocaleStat[] = targetLocales.map((locale) => {
    const translatedCount = translatedByLocale.get(locale) ?? 0;
    const reviewCount = reviewByLocale.get(locale) ?? 0;
    const missingCount = missingByLocale.get(locale) ?? 0;
    const progress = totalKeys === 0 ? 100 : clampPercent((translatedCount / totalKeys) * 100);
    return {
      locale,
      label: getProjectLocaleLabel(locale),
      progress,
      translatedCount,
      reviewCount,
      missingCount,
      lastActivity: lastActivityByLocale.get(locale) ?? null
    };
  });

  const globalProgress =
    localeStats.length === 0
      ? 100
      : clampPercent(localeStats.reduce((sum, s) => sum + s.progress, 0) / localeStats.length);

  const pendingReview = localeStats.reduce((sum, s) => sum + s.reviewCount, 0);
  const missing = localeStats.reduce((sum, s) => sum + s.missingCount, 0);

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      sourceLocale: project.sourceLocale,
      targetLocales,
      totalKeys
    },
    stats: {
      globalProgress,
      pendingReview,
      missing
    },
    localeStats
  };
}

export async function listProjectOverviewRecentEntriesQuery(
  projectId: number,
  input?: { limit?: number }
): Promise<ProjectOverviewRecentEntry[]> {
  await requireProjectAccess(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { sourceLocale: true }
  });
  if (!project) return [];

  const locales = await prisma.projectLocale.findMany({
    where: { projectId },
    select: { locale: true }
  });
  const targetLocales = locales.map((l) => l.locale).filter((l) => l !== project.sourceLocale);
  if (targetLocales.length === 0) return [];

  const limit = Math.min(Math.max(1, input?.limit ?? 10), 50);

  const translations = await prisma.translation.findMany({
    where: { projectId, locale: { in: targetLocales } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      locale: true,
      status: true,
      text: true,
      updatedAt: true,
      entry: { select: { key: true, sourceText: true } }
    }
  });

  return translations.map((tr) => {
    const hasText = Boolean(tr.text?.trim());
    const statusLabel: ProjectOverviewRecentEntry['status'] =
      tr.status === 'approved' ? '已完成' : tr.status === 'pending' || !hasText ? '待翻译' : '待验收';
    return {
      key: tr.entry.key,
      source: tr.entry.sourceText,
      status: statusLabel,
      locale: tr.locale,
      updatedAt: tr.updatedAt.toISOString()
    };
  });
}

