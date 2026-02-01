'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Plus, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card-primitives';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { type TableColumn } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { parseLanguagePack } from '@/lib/packages/language-pack-parser';
import {
  exportLanguagePackAction,
  checkPackagesEntryKeyQuery,
  createPackagesEntryAction,
  importLanguagePackAction,
  getPackagesUploadHistoryDetailQuery,
  listPackagesUploadHistoryQuery,
  listPackagesContextNodesQuery,
  listPackagesEntryPlacementsQuery,
  listPackagesEntriesQuery,
  type PackagesContextPageNode,
  type PackagesUploadHistoryDetail,
  type PackagesUploadHistoryItem,
  type PackagesEntry,
  type PackagesEntryPlacement
} from './actions';
import {
  buildLocaleOptions,
  CreateEntrySheet,
  DownloadDialog,
  EntriesTabContent,
  formatDateTime,
  HistoryDetailSheet,
  HistoryTabContent,
  ImportTabContent,
  type ImportBindPlanDraft,
  type ImportPreview,
  type DownloadMode,
  type TabKey,
  type TranslationStatus,
  PlacementsDialog,
  randomShortId,
  StatusPill,
  useSearchPagination
} from './project-packages-components';

export function ProjectPackagesClient({
  projectId,
  sourceLocale,
  targetLocales,
  templateShape,
  canManage,
  initialEntries,
  initialTab,
  bootstrapError,
  entriesError
}: {
  projectId: number;
  sourceLocale: string;
  targetLocales: string[];
  templateShape: 'flat' | 'tree';
  canManage: boolean;
  initialEntries: PackagesEntry[];
  initialTab?: TabKey;
  bootstrapError: string;
  entriesError: string;
}) {
  const { push } = useToast();
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<TabKey>(() => initialTab ?? 'entries');
  const [selectedLocale, setSelectedLocale] = useState(sourceLocale);
  const [query, setQuery] = useState('');

  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadLocale, setDownloadLocale] = useState(sourceLocale);
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('fallback');

  const [entries, setEntries] = useState<PackagesEntry[]>(() => initialEntries);

  const [poolOnly, setPoolOnly] = useState(false);
  const [filledFilter, setFilledFilter] = useState<'all' | 'filled' | 'empty'>('all');
  const [statusFilter, setStatusFilter] = useState<TranslationStatus | 'all'>('all');

  const [placementsOpen, setPlacementsOpen] = useState(false);
  const [placementsBusy, setPlacementsBusy] = useState(false);
  const [placementsError, setPlacementsError] = useState<string | null>(null);
  const [placementsEntry, setPlacementsEntry] = useState<PackagesEntry | null>(null);
  const [placements, setPlacements] = useState<PackagesEntryPlacement[]>([]);

  const [importBusy, setImportBusy] = useState(false);
  const [importStage, setImportStage] = useState<'idle' | 'parsed' | 'confirmed'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importFileSize, setImportFileSize] = useState<number | null>(null);
  const [importRawJson, setImportRawJson] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMap, setImportMap] = useState<Record<string, string> | null>(null);
  const [previewTab, setPreviewTab] = useState<'added' | 'updated' | 'ignored'>('added');
  const [lastImportContextLink, setLastImportContextLink] = useState<string | null>(null);

  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<PackagesUploadHistoryItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PackagesUploadHistoryDetail | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKeyMode, setCreateKeyMode] = useState<'auto' | 'manual'>('auto');
  const [createKey, setCreateKey] = useState(() => `ctx_${randomShortId()}`);
  const [createSourceText, setCreateSourceText] = useState('');
  const [createTargetLocale, setCreateTargetLocale] = useState(targetLocales[0] ?? '');
  const [createTargetText, setCreateTargetText] = useState('');
  const [createPageId, setCreatePageId] = useState('');
  const [createModuleId, setCreateModuleId] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [keyCheck, setKeyCheck] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');

  const [contextLoaded, setContextLoaded] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextPages, setContextPages] = useState<PackagesContextPageNode[]>([]);

  const localeOptions = useMemo(
    () => buildLocaleOptions(sourceLocale, targetLocales),
    [sourceLocale, targetLocales]
  );

  const sortedEntries = useMemo(() => {
    const list = [...entries];
    list.sort((a, b) => a.key.localeCompare(b.key));
    return list;
  }, [entries]);

  const isSource = selectedLocale === sourceLocale;
  const currentLocaleStats = useMemo(() => {
    const total = sortedEntries.length;
    if (isSource) return { total, filled: total, pendingReview: 0, needsUpdate: 0 };
    let filled = 0;
    let pendingReview = 0;
    let needsUpdate = 0;
    for (const e of sortedEntries) {
      const tr = e.translations[selectedLocale];
      if (tr?.text?.trim()) filled += 1;
      if (tr?.status === 'needs_review' || tr?.status === 'ready') pendingReview += 1;
      if (tr?.status === 'needs_update') needsUpdate += 1;
    }
    return { total, filled, pendingReview, needsUpdate };
  }, [isSource, selectedLocale, sortedEntries]);

  const entriesByFilters = useMemo(() => {
    return sortedEntries.filter((e) => {
      if (poolOnly && e.placementCount > 0) return false;
      if (isSource) return true;

      const tr = e.translations[selectedLocale];
      const text = tr?.text ?? '';
      const status = (tr?.status ?? 'pending') as TranslationStatus;

      if (filledFilter === 'filled' && !text.trim()) return false;
      if (filledFilter === 'empty' && text.trim()) return false;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      return true;
    });
  }, [filledFilter, isSource, poolOnly, selectedLocale, sortedEntries, statusFilter]);

  const { page, setPage, pageCount, filteredTotal, pageItems } = useSearchPagination({
    items: entriesByFilters,
    query: tab === 'entries' ? query : '',
    pageSize: 20,
    predicate: (e, q) => {
      const current = isSource
        ? e.sourceText
        : (e.translations[selectedLocale]?.text ?? '').toString();
      return (
        e.key.toLowerCase().includes(q) ||
        e.sourceText.toLowerCase().includes(q) ||
        current.toLowerCase().includes(q)
      );
    }
  });

  const openPlacements = async (entry: PackagesEntry) => {
    setPlacementsEntry(entry);
    setPlacementsOpen(true);
    setPlacementsError(null);
    setPlacementsBusy(true);
    try {
      const res = await listPackagesEntryPlacementsQuery({ projectId, entryId: entry.id });
      if (!res.ok) {
        setPlacementsError(res.error);
        setPlacements([]);
        return;
      }
      setPlacements(res.data.items);
    } catch {
      setPlacementsError('加载归属失败，请重试。');
      setPlacements([]);
    } finally {
      setPlacementsBusy(false);
    }
  };

  const entryColumns = useMemo<Array<TableColumn<PackagesEntry>>>(
    () => [
      {
        key: 'key',
        title: 'Key',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top',
        render: (_value: unknown, record: PackagesEntry) => (
          <code className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground">
            {record.key}
          </code>
        )
      },
      {
        key: 'sourceText',
        title: '源文案',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-foreground',
        render: (_value: unknown, record: PackagesEntry) => (
          <div className="max-w-[420px] break-words">{record.sourceText}</div>
        )
      },
      {
        key: 'currentText',
        title: '当前语言',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-foreground',
        render: (_value: unknown, record: PackagesEntry) => {
          const current = isSource
            ? record.sourceText
            : (record.translations[selectedLocale]?.text ?? '');
          return current?.trim() ? (
            <div className="max-w-[420px] break-words">{current}</div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        }
      },
      {
        key: 'status',
        title: '状态',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top',
        render: (_value: unknown, record: PackagesEntry) => {
          if (isSource) return <span className="text-xs text-muted-foreground">源语言</span>;
          const tr = record.translations[selectedLocale];
          return <StatusPill status={(tr?.status ?? 'pending') as TranslationStatus} />;
        }
      },
      {
        key: 'placement',
        title: '归属',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top',
        render: (_value: unknown, record: PackagesEntry) => {
          const label = record.placement
            ? `${record.placement.pageTitle || record.placement.pageRoute}${record.placement.moduleName ? ` / ${record.placement.moduleName}` : ''}`
            : '未归属';

          return (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={record.placement ? 'outline' : 'secondary'} className="max-w-[280px] truncate">
                {label}
              </Badge>
              {record.hasMorePlacements ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => void openPlacements(record)}
                >
                  查看更多
                </Button>
              ) : null}
            </div>
          );
        }
      },
      {
        key: 'updatedAt',
        title: '更新时间',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-muted-foreground',
        render: (_value: unknown, record: PackagesEntry) => (
          <span suppressHydrationWarning>{formatDateTime(record.updatedAt)}</span>
        )
      }
    ],
    [isSource, openPlacements, selectedLocale]
  );

  const selectedLocaleLabel = useMemo(() => {
    const found = localeOptions.find((o) => o.code === selectedLocale);
    if (!found) return selectedLocale;
    return found.label;
  }, [localeOptions, selectedLocale]);

  const loadHistory = async (force?: boolean) => {
    if (historyBusy) return;
    if (!force && historyLoaded) return;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const res = await listPackagesUploadHistoryQuery(projectId);
      if (!res.ok) {
        setHistoryError(res.error);
        setHistory([]);
        setHistoryLoaded(true);
        return;
      }
      setHistory(res.data.items);
      setHistoryLoaded(true);
    } catch {
      setHistoryError('加载上传历史失败，请重试。');
      setHistory([]);
      setHistoryLoaded(true);
    } finally {
      setHistoryBusy(false);
    }
  };

  const openHistoryDetail = async (uploadId: number) => {
    setDetailOpen(true);
    setDetailBusy(true);
    setDetailError(null);
    setDetail(null);
    try {
      const res = await getPackagesUploadHistoryDetailQuery({ projectId, uploadId });
      if (!res.ok) {
        setDetailError(res.error);
        return;
      }
      setDetail(res.data);
    } catch {
      setDetailError('加载详情失败，请重试。');
    } finally {
      setDetailBusy(false);
    }
  };

  useEffect(() => {
    if (tab !== 'history') return;
    void loadHistory();
  }, [tab, historyLoaded]);

  const {
    page: historyPage,
    setPage: setHistoryPage,
    pageCount: historyPageCount,
    filteredTotal: historyFilteredTotal,
    pageItems: historyPageItems
  } = useSearchPagination({
    items: history,
    query: historyQuery,
    pageSize: 20,
    predicate: (it, q) => {
      return (
        it.locale.toLowerCase().includes(q) ||
        it.operator.toLowerCase().includes(q) ||
        formatDateTime(it.createdAt).toLowerCase().includes(q)
      );
    }
  });

  const historyColumns = useMemo<Array<TableColumn<PackagesUploadHistoryItem>>>(
    () => [
      {
        key: 'createdAt',
        title: '时间',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-foreground',
        render: (_value: unknown, record: PackagesUploadHistoryItem) => (
          <span suppressHydrationWarning>{formatDateTime(record.createdAt)}</span>
        )
      },
      {
        key: 'locale',
        title: '语言',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top',
        render: (_value: unknown, record: PackagesUploadHistoryItem) => (
          <div className="flex items-center gap-2">
            <span className="text-foreground">{record.locale}</span>
            <Badge variant={record.locale === sourceLocale ? 'secondary' : 'outline'}>
              {record.locale === sourceLocale ? '源' : '目标'}
            </Badge>
          </div>
        )
      },
      {
        key: 'operator',
        title: '操作者',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-foreground',
        render: (_value: unknown, record: PackagesUploadHistoryItem) => record.operator
      },
      {
        key: 'summary',
        title: '摘要',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top',
        render: (_value: unknown, record: PackagesUploadHistoryItem) => (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">新增 {record.summary.added}</Badge>
            <Badge variant="outline">更新 {record.summary.updated}</Badge>
            <Badge variant="outline">缺失 {record.summary.missing}</Badge>
            {record.locale === sourceLocale ? (
              <Badge variant="outline">待更新 {record.summary.markedNeedsUpdate}</Badge>
            ) : (
              <Badge variant="outline">忽略 {record.summary.ignored}</Badge>
            )}
          </div>
        )
      },
      {
        key: 'actions',
        title: '操作',
        headerClassName: 'bg-card px-3 py-2 text-right font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-right',
        align: 'right',
        render: (_value: unknown, record: PackagesUploadHistoryItem) => (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void openHistoryDetail(record.id)}
          >
            <Eye />
            查看
          </Button>
        )
      }
    ],
    [openHistoryDetail, sourceLocale]
  );

  const loadContextNodes = async (force?: boolean) => {
    if (contextBusy) return;
    if (!force && contextLoaded) return;
    setContextBusy(true);
    setContextError(null);
    try {
      const res = await listPackagesContextNodesQuery(projectId);
      if (!res.ok) {
        setContextError(res.error);
        setContextPages([]);
        setContextLoaded(true);
        return;
      }
      setContextPages(res.data.pages);
      setContextLoaded(true);
    } catch {
      setContextError('加载页面/模块失败，请重试。');
      setContextPages([]);
      setContextLoaded(true);
    } finally {
      setContextBusy(false);
    }
  };

  const resetCreateForm = () => {
    setCreateError(null);
    setCreateKeyMode('auto');
    setCreateKey(`ctx_${randomShortId()}`);
    setCreateSourceText('');
    setCreateTargetLocale(targetLocales[0] ?? '');
    setCreateTargetText('');
    setCreatePageId('');
    setCreateModuleId('');
    setKeyCheck('idle');
  };

  const selectedPage = useMemo(() => {
    const id = Number(createPageId);
    if (!Number.isFinite(id)) return null;
    return contextPages.find((p) => p.id === id) ?? null;
  }, [contextPages, createPageId]);

  const moduleOptions = useMemo(() => {
    if (!selectedPage) return [];
    return selectedPage.modules.map((m) => ({ value: String(m.id), label: m.name }));
  }, [selectedPage]);

  useEffect(() => {
    if (!createOpen) return;
    void loadContextNodes();
  }, [createOpen]);

  useEffect(() => {
    if (tab !== 'import') return;
    void loadContextNodes();
  }, [tab]);

  useEffect(() => {
    if (!selectedPage) {
      if (createModuleId) setCreateModuleId('');
      return;
    }
    if (!createModuleId) return;
    const id = Number(createModuleId);
    const exists = selectedPage.modules.some((m) => m.id === id);
    if (!exists) setCreateModuleId('');
  }, [createModuleId, selectedPage]);

  useEffect(() => {
    if (!createOpen) return;
    const key = createKey.trim();
    if (!key) {
      setKeyCheck('idle');
      return;
    }
    if (entries.some((e) => e.key === key)) {
      setKeyCheck('taken');
      return;
    }
    setKeyCheck('checking');
    const handle = window.setTimeout(async () => {
      try {
        const res = await checkPackagesEntryKeyQuery({ projectId, key });
        if (!res.ok) {
          setKeyCheck('error');
          return;
        }
        setKeyCheck(res.data.available ? 'available' : 'taken');
      } catch {
        setKeyCheck('error');
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [createKey, createOpen, entries, projectId]);

  const handleCreateEntry = async () => {
    if (!canManage) return;
    const key = createKey.trim();
    const sourceText = createSourceText.trim();
    if (!key) {
      setCreateError('请输入 key。');
      return;
    }
    if (!sourceText) {
      setCreateError('请输入源文案。');
      return;
    }
    if (keyCheck === 'taken') {
      setCreateError('key 已存在：请修改 key 或重新生成。');
      return;
    }
    setCreateError(null);
    setCreateBusy(true);
    try {
      const res = await createPackagesEntryAction({
        projectId,
        key,
        sourceText,
        targetLocale: createTargetLocale || undefined,
        targetText: createTargetText.trim() ? createTargetText.trim() : undefined,
        pageId: createPageId ? Number(createPageId) : undefined,
        moduleId: createModuleId ? Number(createModuleId) : undefined
      });
      if (!res.ok) {
        setCreateError(res.error);
        return;
      }

      const refreshed = await listPackagesEntriesQuery(projectId);
      if (refreshed.ok) setEntries(refreshed.data.items);

      push({ variant: 'default', title: '新增成功', message: key });
      setCreateOpen(false);
      resetCreateForm();
      setTab('entries');
    } catch {
      setCreateError('新增过程中发生异常，请重试。');
    } finally {
      setCreateBusy(false);
    }
  };

  const resetImport = () => {
    setImportBusy(false);
    setImportStage('idle');
    setImportError(null);
    setImportFileName('');
    setImportFileSize(null);
    setImportRawJson('');
    setImportPreview(null);
    setImportMap(null);
    setPreviewTab('added');
    if (importFileRef.current) importFileRef.current.value = '';
  };

  const buildImportPreviewFromParsed = (parsed: {
    shape: 'flat' | 'tree';
    map: Record<string, string>;
  }): ImportPreview => {
    const incoming = parsed.map;
    const incomingKeys = Object.keys(incoming);
    const incomingTotal = incomingKeys.length;
    const existingByKey = new Map(sortedEntries.map((e) => [e.key, e] as const));
    let existingTotal = 0;
    let existingWithPlacements = 0;

    if (selectedLocale === sourceLocale) {
      const added: ImportPreview['added'] = [];
      const updated: ImportPreview['updated'] = [];

      for (const key of incomingKeys) {
        const next = incoming[key] ?? '';
        const existing = existingByKey.get(key);
        if (!existing) {
          added.push({ key, text: next });
          continue;
        }
        existingTotal += 1;
        if (existing.placementCount > 0) existingWithPlacements += 1;
        if (existing.sourceText !== next) {
          updated.push({ key, before: existing.sourceText, after: next });
        }
      }

      return {
        kind: 'source',
        shape: parsed.shape,
        incomingKeys,
        incomingTotal,
        existingTotal,
        existingWithPlacements,
        summary: {
          added: added.length,
          updated: updated.length,
          ignored: 0
        },
        added,
        updated,
        ignored: []
      };
    }

    const ignored: ImportPreview['ignored'] = [];
    const updated: ImportPreview['updated'] = [];

    for (const key of incomingKeys) {
      const existing = existingByKey.get(key);
      if (!existing) {
        ignored.push({ key });
        continue;
      }
      existingTotal += 1;
      if (existing.placementCount > 0) existingWithPlacements += 1;
      const next = incoming[key] ?? '';
      const before = existing.translations[selectedLocale]?.text ?? '';
      if (next === before) continue;
      if (!next.trim()) continue;
      updated.push({ key, before, after: next });
    }

    return {
      kind: 'target',
      shape: parsed.shape,
      incomingKeys,
      incomingTotal,
      existingTotal,
      existingWithPlacements,
      summary: {
        added: 0,
        updated: updated.length,
        ignored: ignored.length
      },
      added: [],
      updated,
      ignored
    };
  };

  const handlePickImportFile = async (file: File) => {
    setImportError(null);
    setImportBusy(true);
    setImportStage('idle');
    setImportPreview(null);
    setImportMap(null);
    setPreviewTab(selectedLocale === sourceLocale ? 'added' : 'updated');
    setImportFileName(file.name);
    setImportFileSize(file.size);
    try {
      const text = await file.text();
      setImportRawJson(text);
      const parsed = parseLanguagePack(text);
      if (!parsed.ok) {
        setImportError(parsed.error);
        setImportStage('idle');
        return;
      }
      setImportMap(parsed.data.map);
      const preview = buildImportPreviewFromParsed({ shape: parsed.data.shape, map: parsed.data.map });
      setPreviewTab(() => {
        if (preview.kind === 'source') return 'added';
        if (preview.summary.updated > 0) return 'updated';
        if (preview.summary.ignored > 0) return 'ignored';
        return 'updated';
      });
      setImportPreview(preview);
      setImportStage('parsed');
    } catch {
      setImportError('读取文件失败，请重试。');
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmImport = async (bindPlan: ImportBindPlanDraft | null) => {
    if (!importRawJson.trim()) return;
    if (!importPreview) return;
    if (importPreview.summary.added + importPreview.summary.updated === 0) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const normalizedBindPlan =
        !bindPlan
          ? undefined
          : bindPlan.mode === 'single'
            ? {
                mode: 'single' as const,
                scope: bindPlan.scope,
                target: {
                  pageId:
                    bindPlan.pageMode === 'existing' && bindPlan.pageId ? Number(bindPlan.pageId) : undefined,
                  moduleId:
                    bindPlan.moduleMode === 'existing' && bindPlan.moduleId ? Number(bindPlan.moduleId) : undefined
                },
                createContext: {
                  page:
                    bindPlan.pageMode === 'create' && bindPlan.createPageRoute?.trim()
                      ? {
                          route: bindPlan.createPageRoute.trim(),
                          title: bindPlan.createPageTitle?.trim() ? bindPlan.createPageTitle.trim() : undefined
                        }
                      : undefined,
                  module:
                    bindPlan.moduleMode === 'create' && bindPlan.createModuleName?.trim()
                      ? { name: bindPlan.createModuleName.trim() }
                      : undefined
                }
              }
            : {
                mode: 'per_key' as const,
                scope: bindPlan.scope,
                items: bindPlan.items
                  .map((it) => ({
                    key: it.key,
                    pageId: Number(it.pageId),
                    moduleId: it.moduleId ? Number(it.moduleId) : undefined
                  }))
                  .filter((it) => Number.isFinite(it.pageId))
              };

      const res = await importLanguagePackAction({
        projectId,
        locale: selectedLocale,
        rawJson: importRawJson,
        bindPlan: normalizedBindPlan
      });
      if (!res.ok) {
        setImportError(res.error);
        return;
      }

      const refreshed = await listPackagesEntriesQuery(projectId);
      if (refreshed.ok) setEntries(refreshed.data.items);
      if (res.ok && res.data.bind) {
        await loadContextNodes(true);
      }

      setImportStage('confirmed');
      if (res.data.bind && res.data.bind.targetsCount === 1 && typeof res.data.bind.pageId === 'number') {
        const qs = new URLSearchParams({ pageId: String(res.data.bind.pageId) });
        if (typeof res.data.bind.moduleId === 'number') {
          qs.set('moduleId', String(res.data.bind.moduleId));
        }
        setLastImportContextLink(`/projects/${projectId}/context?${qs.toString()}`);
      } else {
        setLastImportContextLink(null);
      }
      const bindHint = res.data.bind ? ` · 已设置归属 ${res.data.bind.boundCount} 条` : '';
      push({
        variant: 'default',
        title: '导入成功',
        message:
          res.data.kind === 'source'
            ? `新增 ${res.data.summary.added} · 更新 ${res.data.summary.updated} · 标记待更新 ${res.data.summary.markedNeedsUpdate}`
            : `更新 ${res.data.summary.updated} · 忽略 ${res.data.summary.ignored} · 跳过空值 ${res.data.summary.skippedEmpty}` + bindHint
      });
      setTab('history');
      setHistoryLoaded(false);
    } catch {
      setImportError('导入过程中发生异常，请重试。');
    } finally {
      setImportBusy(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await exportLanguagePackAction({
        projectId,
        locale: downloadLocale,
        mode: downloadMode
      });
      if (!res.ok) {
        push({ variant: 'destructive', title: '导出失败', message: res.error });
        return;
      }

      const blob = new Blob([res.data.content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      push({ variant: 'default', title: '已开始下载', message: `导出语言：${downloadLocale}` });
      setDownloadOpen(false);
    } catch {
      push({ variant: 'destructive', title: '导出失败', message: '导出过程中发生异常，请重试。' });
    }
  };

  if (bootstrapError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">加载失败</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{bootstrapError}</CardContent>
      </Card>
    );
  }

  if (!targetLocales.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">请先添加目标语言</CardTitle>
          <CardAction>
            <Button asChild>
              <Link href={`/projects/${projectId}/settings/locales`}>前往项目设置</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          未配置目标语言时，仍可在源语言下上传/下载与维护词条；目标语言相关能力将不可用。
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PlacementsDialog
        open={placementsOpen}
        onOpenChange={setPlacementsOpen}
        placementsEntry={placementsEntry}
        placements={placements}
        placementsError={placementsError}
        placementsBusy={placementsBusy}
        projectId={projectId}
      />

      <HistoryDetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetail(null);
            setDetailError(null);
          }
        }}
        detail={detail}
        detailBusy={detailBusy}
        detailError={detailError}
        sourceLocale={sourceLocale}
        targetLocales={targetLocales}
        projectId={projectId}
      />

      <CreateEntrySheet
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError(null);
        }}
        canManage={canManage}
        createError={createError}
        createBusy={createBusy}
        keyCheck={keyCheck}
        createKey={createKey}
        createKeyMode={createKeyMode}
        onKeyChange={setCreateKey}
        onKeyModeChange={setCreateKeyMode}
        onGenerateKey={() => setCreateKey(`ctx_${randomShortId()}`)}
        createSourceText={createSourceText}
        onSourceTextChange={setCreateSourceText}
        createTargetLocale={createTargetLocale}
        onTargetLocaleChange={setCreateTargetLocale}
        createTargetText={createTargetText}
        onTargetTextChange={setCreateTargetText}
        createPageId={createPageId}
        onPageChange={setCreatePageId}
        createModuleId={createModuleId}
        onModuleChange={setCreateModuleId}
        contextError={contextError}
        contextLoaded={contextLoaded}
        contextBusy={contextBusy}
        contextPages={contextPages}
        selectedPage={selectedPage}
        moduleOptions={moduleOptions}
        targetLocales={targetLocales}
        onSubmit={() => void handleCreateEntry()}
        projectId={projectId}
      />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-base">语言包管理</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                管理原文与翻译内容，支持导入/导出与页面/模块归属。组织形式：{templateShape === 'tree' ? '树形' : '扁平'}。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu
                trigger={
                  <Button type="button" variant="outline" className="h-10 min-w-[220px] justify-between">
                    <span className="truncate">
                      <span className="text-foreground">{selectedLocaleLabel}</span>
                      <span className="ml-1 text-xs text-muted-foreground">{selectedLocale}</span>
                    </span>
                    <Badge
                      variant={isSource ? 'secondary' : 'outline'}
                      className="ml-2"
                    >
                      {isSource ? '源' : '目标'}
                    </Badge>
                  </Button>
                }
                contentProps={{
                  align: 'end',
                  style: { width: 'var(--radix-popper-anchor-width)' },
                  className: 'max-w-[calc(100vw-2rem)] min-w-[220px]'
                }}
                items={[
                  {
                    type: 'radio-group',
                    value: selectedLocale,
                    onValueChange: (v) => {
                      setSelectedLocale(v);
                      setQuery('');
                      setPage(1);
                    },
                    items: localeOptions.map((opt) => ({
                      value: opt.code,
                      label: (
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="flex items-center gap-2">
                            <span className="text-foreground">{opt.label}</span>
                            <Badge variant={opt.kind === 'source' ? 'secondary' : 'outline'}>
                              {opt.kind === 'source' ? '源' : '目标'}
                            </Badge>
                          </span>
                          <span className="text-xs text-muted-foreground">{opt.code}</span>
                        </span>
                      )
                    }))
                  }
                ]}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTab('import');
                  requestAnimationFrame(() => importFileRef.current?.focus());
                }}
              >
                <Upload />
                上传语言包
              </Button>

              <DownloadDialog
                open={downloadOpen}
                onOpenChange={setDownloadOpen}
                downloadLocale={downloadLocale}
                onDownloadLocaleChange={setDownloadLocale}
                downloadMode={downloadMode}
                onDownloadModeChange={setDownloadMode}
                localeOptions={localeOptions}
                sourceLocale={sourceLocale}
                onConfirm={() => void handleDownload()}
              />

              <Button type="button" variant="outline" onClick={() => setTab('history')}>
                历史
              </Button>

              <Button
                type="button"
                disabled={!canManage}
                onClick={() => {
                  resetCreateForm();
                  setCreateOpen(true);
                }}
              >
                <Plus />
                新增词条
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">总数 {currentLocaleStats.total}</Badge>
            <Badge variant="outline">已填写 {currentLocaleStats.filled}</Badge>
            {isSource ? null : (
              <>
                <Badge variant="outline">待核对 {currentLocaleStats.pendingReview}</Badge>
                <Badge variant="outline">待更新 {currentLocaleStats.needsUpdate}</Badge>
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              setTab(v as TabKey);
              setQuery('');
              setPage(1);
            }}
            items={[
              {
                value: 'entries',
                label: (
                  <span className="flex items-center gap-2">
                    词条列表
                    <Badge variant="secondary">{filteredTotal}</Badge>
                  </span>
                ),
                content: (
                  <EntriesTabContent
                    query={query}
                    onQueryChange={setQuery}
                    poolOnly={poolOnly}
                    onPoolOnlyChange={(value) => {
                      setPoolOnly(value);
                      setPage(1);
                    }}
                    filledFilter={filledFilter}
                    onFilledFilterChange={(value) => {
                      setFilledFilter(value);
                      setPage(1);
                    }}
                    statusFilter={statusFilter}
                    onStatusFilterChange={(value) => {
                      setStatusFilter(value);
                      setPage(1);
                    }}
                    isSource={isSource}
                    filteredTotal={filteredTotal}
                    entriesError={entriesError}
                    entryColumns={entryColumns}
                    pageItems={pageItems}
                    page={page}
                    pageCount={pageCount}
                    onPageChange={setPage}
                    projectId={projectId}
                  />
                )
              },
              {
                value: 'import',
                label: '上传导入',
                content: (
                  <ImportTabContent
                    selectedLocale={selectedLocale}
                    isSource={isSource}
                    importBusy={importBusy}
                    importStage={importStage}
                    importFileRef={importFileRef}
                    importFileName={importFileName}
                    importFileSize={importFileSize}
                    importPreview={importPreview}
                    importMap={importMap}
                    importError={importError}
                    previewTab={previewTab}
                    onPreviewTabChange={(value) => setPreviewTab(value)}
                    onPickFile={handlePickImportFile}
                    onReset={resetImport}
                    onConfirm={(bindPlan) => void handleConfirmImport(bindPlan)}
                    canManage={canManage}
                    contextError={contextError}
                    contextLoaded={contextLoaded}
                    contextBusy={contextBusy}
                    contextPages={contextPages}
                    projectId={projectId}
                  />
                )
              },
              {
                value: 'history',
                label: '上传历史',
                content: (
                  <HistoryTabContent
                    historyQuery={historyQuery}
                    onHistoryQueryChange={setHistoryQuery}
                    historyBusy={historyBusy}
                    historyError={historyError}
                    onRefresh={() => void loadHistory(true)}
                    historyColumns={historyColumns}
                    historyPageItems={historyPageItems}
                    historyPage={historyPage}
                    historyPageCount={historyPageCount}
                    historyFilteredTotal={historyFilteredTotal}
                    onPageChange={setHistoryPage}
                    contextLink={lastImportContextLink}
                  />
                )
              }
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
