'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, RefreshCcw, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog-primitives';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Table, type TableColumn } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { TargetLocaleSelect } from '@/components/target-locale-select';
import { getProjectLocaleLabel } from '@/lib/locales';
import { cn } from '@/lib/utils';
import type { PackagesContextPageNode, PackagesEntry, PackagesEntryPlacement, PackagesUploadHistoryDetail, PackagesUploadHistoryItem } from './actions';

export type TranslationStatus = 'pending' | 'needs_update' | 'needs_review' | 'ready' | 'approved';
export type DownloadMode = 'empty' | 'fallback' | 'filled';
export type TabKey = 'entries' | 'import' | 'history';

export type ImportPreview = {
  kind: 'source' | 'target';
  shape: 'flat' | 'tree';
  incomingKeys: string[];
  incomingTotal: number;
  existingTotal: number;
  existingWithPlacements: number;
  summary: { added: number; updated: number; ignored: number };
  added: Array<{ key: string; text: string }>;
  updated: Array<{ key: string; before: string; after: string }>;
  ignored: Array<{ key: string }>;
};

export function randomShortId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(16).slice(2, 10);
}

export function formatDateTime(iso: string) {
  const ms = Date.parse(iso);
  const date = Number.isFinite(ms) ? new Date(ms) : new Date();
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function buildLocaleOptions(sourceLocale: string, targetLocales: string[]) {
  const seen = new Set<string>();
  const out: Array<{ code: string; label: string; kind: 'source' | 'target' }> = [];
  const add = (code: string, kind: 'source' | 'target') => {
    const trimmed = code.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push({ code: trimmed, label: getProjectLocaleLabel(trimmed), kind });
  };
  add(sourceLocale, 'source');
  for (const l of targetLocales) add(l, 'target');
  return out;
}

export function StatusPill({ status }: { status: TranslationStatus }) {
  const { label, cls } =
    status === 'approved'
      ? { label: '已定版', cls: 'border-success/30 text-success' }
      : status === 'needs_review' || status === 'ready'
        ? { label: '待核对', cls: 'border-warning/40 text-warning' }
        : status === 'needs_update'
          ? { label: '待更新', cls: 'border-info/30 text-info' }
          : { label: '待翻译', cls: 'border-border text-muted-foreground' };

  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs', cls)}>{label}</span>;
}

type PreviewTableProps =
  | {
      kind: 'added';
      items: Array<{ key: string; text: string }>;
      emptyText: string;
    }
  | {
      kind: 'updated';
      items: Array<{ key: string; before: string; after: string }>;
      emptyText: string;
    }
  | {
      kind: 'ignored';
      items: Array<{ key: string }>;
      emptyText: string;
    };

export function PreviewTable(props: PreviewTableProps) {
  const [query, setQuery] = useState('');

  const columns = useMemo((): Array<TableColumn<any>> => {
    if (props.kind === 'added') {
      return [
        {
          key: 'key',
          title: 'Key',
          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
          cellClassName: 'px-3 py-2 align-top',
          render: (_value: unknown, record: any) => (
            <code className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground">
              {record.key}
            </code>
          )
        },
        {
          key: 'text',
          title: '文案',
          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
          cellClassName: 'px-3 py-2 align-top text-foreground',
          render: (_value: unknown, record: any) => <div className="max-w-[520px] break-words">{record.text}</div>
        }
      ];
    }

    if (props.kind === 'ignored') {
      return [
        {
          key: 'key',
          title: 'Key',
          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
          cellClassName: 'px-3 py-2 align-top',
          render: (_value: unknown, record: any) => (
            <code className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground">
              {record.key}
            </code>
          )
        }
      ];
    }

    return [
      {
        key: 'key',
        title: 'Key',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top',
        render: (_value: unknown, record: any) => (
          <code className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground">
            {record.key}
          </code>
        )
      },
      {
        key: 'before',
        title: '变更前',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-foreground',
        render: (_value: unknown, record: any) => <div className="max-w-[360px] break-words">{record.before || '—'}</div>
      },
      {
        key: 'after',
        title: '变更后',
        headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
        cellClassName: 'px-3 py-2 align-top text-foreground',
        render: (_value: unknown, record: any) => <div className="max-w-[360px] break-words">{record.after || '—'}</div>
      }
    ];
  }, [props.kind, props.items]);

  const { page, setPage, pageCount, filteredTotal, pageItems } = useSearchPagination({
    items: props.items,
    query,
    pageSize: 20,
    predicate: (it, q) => {
      const key = String((it as any)?.key ?? '').toLowerCase();
      if (key.includes(q)) return true;
      if (props.kind === 'added') return String((it as any)?.text ?? '').toLowerCase().includes(q);
      if (props.kind === 'updated') {
        const before = String((it as any)?.before ?? '').toLowerCase();
        const after = String((it as any)?.after ?? '').toLowerCase();
        return before.includes(q) || after.includes(q);
      }
      return false;
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索 key / 文案" />
        <div className="text-sm text-muted-foreground">共 {filteredTotal} 条</div>
      </div>
      <Table columns={columns} data={pageItems as any[]} emptyText={props.emptyText} />
      <Pagination page={page} pageCount={pageCount} total={filteredTotal} onChange={setPage} />
    </div>
  );
}

export function useSearchPagination<T>({
  items,
  query,
  pageSize,
  predicate
}: {
  items: T[];
  query: string;
  pageSize: number;
  predicate: (item: T, q: string) => boolean;
}) {
  const [page, setPage] = useState(1);
  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalized) return items;
    return items.filter((it) => predicate(it, normalized));
  }, [items, normalized, predicate]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = useMemo(() => {
    const safePage = Math.min(page, pageCount);
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageCount, pageSize]);

  const setSafePage = (next: number) => {
    setPage(Math.min(Math.max(1, next), pageCount));
  };

  return { page, setPage: setSafePage, pageCount, filteredTotal: filtered.length, pageItems };
}

export function PlacementsDialog({
  open,
  onOpenChange,
  placementsEntry,
  placements,
  placementsError,
  placementsBusy,
  projectId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placementsEntry: PackagesEntry | null;
  placements: PackagesEntryPlacement[];
  placementsError: string | null;
  placementsBusy: boolean;
  projectId: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">词条归属</DialogTitle>
          <DialogDescription>
            {placementsEntry ? (
              <span className="break-all">
                Key：<span className="text-foreground">{placementsEntry.key}</span>
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {placementsError ? (
          <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
            {placementsError}
          </div>
        ) : null}
        {placementsBusy ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">共 {placements.length} 条</div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${projectId}/context`}>前往页面/模块管理</Link>
              </Button>
            </div>
            <div className="rounded-md border">
              <Table
                columns={[
                  {
                    key: 'page',
                    title: '页面',
                    headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                    cellClassName: 'px-3 py-2 align-top text-foreground',
                    render: (_value, record: any) => (
                      <div className="space-y-0.5">
                        <div className="text-sm text-foreground">{record.pageTitle || '未命名页面'}</div>
                        <div className="text-xs text-muted-foreground">{record.pageRoute}</div>
                      </div>
                    )
                  },
                  {
                    key: 'module',
                    title: '模块',
                    headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                    cellClassName: 'px-3 py-2 align-top text-foreground',
                    render: (_value, record: any) => record.moduleName || '—'
                  }
                ]}
                data={placements as any[]}
                emptyText="暂无归属"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HistoryDetailSheet({
  open,
  onOpenChange,
  detail,
  detailBusy,
  detailError,
  sourceLocale,
  targetLocales,
  projectId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: PackagesUploadHistoryDetail | null;
  detailBusy: boolean;
  detailError: string | null;
  sourceLocale: string;
  targetLocales: string[];
  projectId: number;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
      title={<span className="text-base">上传详情</span>}
      description={
        detail ? (
          <span className="text-sm text-muted-foreground">
            {formatDateTime(detail.createdAt)} · {detail.locale} · {detail.shape}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )
      }
      footer={
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      }
    >
      {detailBusy ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          加载中…
        </div>
      ) : detailError ? (
        <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
          {detailError}
        </div>
      ) : detail ? (
        <div className="space-y-6">
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">操作者 {detail.operator}</Badge>
              <Badge variant="outline">新增 {detail.summary.added}</Badge>
              <Badge variant="outline">更新 {detail.summary.updated}</Badge>
              <Badge variant="outline">缺失 {detail.summary.missing}</Badge>
              {detail.locale === sourceLocale ? (
                <Badge variant="outline">待更新 {detail.summary.markedNeedsUpdate}</Badge>
              ) : (
                <>
                  <Badge variant="outline">忽略 {detail.summary.ignored}</Badge>
                  <Badge variant="outline">跳过空值 {detail.summary.skippedEmpty}</Badge>
                </>
              )}
            </div>

            {(() => {
              const isSourceUpload = detail.locale === sourceLocale;
              const jumpLocale = isSourceUpload ? (targetLocales[0] ?? '') : detail.locale;
              const jumpStatus = isSourceUpload ? 'needs_update' : 'needs_review';
              const jumpKey = isSourceUpload
                ? detail.details.markedNeedsUpdateKeys[0]
                : detail.details.pendingReviewKeys[0];
              if (!jumpLocale || !jumpKey) return null;
              return (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={`/projects/${projectId}/workbench?locale=${encodeURIComponent(
                      jumpLocale
                    )}&status=${jumpStatus}&key=${encodeURIComponent(jumpKey)}`}
                  >
                    前往翻译工作台
                  </Link>
                </Button>
              );
            })()}
          </div>

          {detail.details.addedKeys.length ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">新增词条</div>
              <div className="flex flex-wrap gap-2">
                {detail.details.addedKeys.slice(0, 200).map((k) => (
                  <code key={k} className="rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground">
                    {k}
                  </code>
                ))}
                {detail.details.addedKeys.length > 200 ? (
                  <span className="text-xs text-muted-foreground">
                    仅展示前 200 条，共 {detail.details.addedKeys.length} 条
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {detail.details.updatedKeys.length ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">修改差异</div>
              <PreviewTable kind="updated" items={detail.details.updatedKeys} emptyText="无修改项" />
            </div>
          ) : null}

          {detail.locale === sourceLocale && detail.details.markedNeedsUpdateKeys.length ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">标记为待更新</div>
              <div className="flex flex-wrap gap-2">
                {detail.details.markedNeedsUpdateKeys.slice(0, 200).map((k) => (
                  <code key={k} className="rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground">
                    {k}
                  </code>
                ))}
                {detail.details.markedNeedsUpdateKeys.length > 200 ? (
                  <span className="text-xs text-muted-foreground">
                    仅展示前 200 条，共 {detail.details.markedNeedsUpdateKeys.length} 条
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {detail.details.ignoredKeys.length ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">被忽略的 key</div>
              <PreviewTable kind="ignored" items={detail.details.ignoredKeys.map((k) => ({ key: k }))} emptyText="无忽略项" />
            </div>
          ) : null}

          {detail.details.skippedEmptyKeys.length ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-foreground">空值跳过</div>
              <div className="flex flex-wrap gap-2">
                {detail.details.skippedEmptyKeys.slice(0, 200).map((k) => (
                  <code key={k} className="rounded-md border border-border bg-card px-2 py-0.5 text-xs text-foreground">
                    {k}
                  </code>
                ))}
                {detail.details.skippedEmptyKeys.length > 200 ? (
                  <span className="text-xs text-muted-foreground">
                    仅展示前 200 条，共 {detail.details.skippedEmptyKeys.length} 条
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">未选择记录</div>
      )}
    </Sheet>
  );
}

export function CreateEntrySheet({
  open,
  onOpenChange,
  canManage,
  createError,
  createBusy,
  keyCheck,
  createKey,
  createKeyMode,
  onKeyChange,
  onKeyModeChange,
  onGenerateKey,
  createSourceText,
  onSourceTextChange,
  createTargetLocale,
  onTargetLocaleChange,
  createTargetText,
  onTargetTextChange,
  createPageId,
  onPageChange,
  createModuleId,
  onModuleChange,
  contextError,
  contextLoaded,
  contextBusy,
  contextPages,
  selectedPage,
  moduleOptions,
  targetLocales,
  onSubmit,
  projectId
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  createError: string | null;
  createBusy: boolean;
  keyCheck: 'idle' | 'checking' | 'available' | 'taken' | 'error';
  createKey: string;
  createKeyMode: 'auto' | 'manual';
  onKeyChange: (value: string) => void;
  onKeyModeChange: (mode: 'auto' | 'manual') => void;
  onGenerateKey: () => void;
  createSourceText: string;
  onSourceTextChange: (value: string) => void;
  createTargetLocale: string;
  onTargetLocaleChange: (value: string) => void;
  createTargetText: string;
  onTargetTextChange: (value: string) => void;
  createPageId: string;
  onPageChange: (value: string) => void;
  createModuleId: string;
  onModuleChange: (value: string) => void;
  contextError: string | null;
  contextLoaded: boolean;
  contextBusy: boolean;
  contextPages: PackagesContextPageNode[];
  selectedPage: PackagesContextPageNode | null;
  moduleOptions: Array<{ value: string; label: string }>;
  targetLocales: string[];
  onSubmit: () => void;
  projectId: number;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
      title={<span className="text-base">新增词条</span>}
      description={<span className="text-sm text-muted-foreground">保存前支持 key 唯一性校验与初始归属选择。</span>}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={createBusy}>
            取消
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canManage || createBusy || keyCheck === 'checking' || keyCheck === 'taken'}>
            {createBusy ? <Loader2 className="animate-spin" /> : null}
            保存并入库
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {createError ? (
          <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
            {createError}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Key</Label>
            <div className="flex items-center gap-2">
              {keyCheck === 'checking' ? (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  校验中
                </Badge>
              ) : keyCheck === 'available' ? (
                <Badge variant="outline">可用</Badge>
              ) : keyCheck === 'taken' ? (
                <Badge variant="destructive">冲突</Badge>
              ) : keyCheck === 'error' ? (
                <Badge variant="outline">校验失败</Badge>
              ) : (
                <Badge variant="outline">待校验</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input value={createKey} onChange={(e) => onKeyChange(e.target.value)} placeholder="例如 order.title 或 ctx_a1b2c3d4" />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={createKeyMode === 'auto' ? 'default' : 'outline'}
                onClick={() => {
                  onKeyModeChange('auto');
                  onGenerateKey();
                }}
              >
                系统生成
              </Button>
              <Button
                type="button"
                size="sm"
                variant={createKeyMode === 'manual' ? 'default' : 'outline'}
                onClick={() => onKeyModeChange('manual')}
              >
                手动输入
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">建议手动输入；保存前会校验项目内唯一性。</div>
        </div>

        <div className="space-y-2">
          <Label>源文案（必填）</Label>
          <Textarea value={createSourceText} onChange={(e) => onSourceTextChange(e.target.value)} placeholder="请输入源语言文案" rows={4} />
        </div>

        <div className="space-y-2">
          <Label>目标语言文案（可选）</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-[220px]">
              <TargetLocaleSelect targetLocales={targetLocales} value={createTargetLocale} onValueChange={onTargetLocaleChange} />
            </div>
            <div className="text-xs text-muted-foreground">仅在该目标语言下写入译文，状态会标记为待核对。</div>
          </div>
          <Textarea value={createTargetText} onChange={(e) => onTargetTextChange(e.target.value)} placeholder="可选：输入该目标语言译文" rows={3} />
        </div>

        <div className="space-y-2">
          <Label>初始归属（可选）</Label>
          {contextError ? (
            <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
              {contextError}
            </div>
          ) : null}
          {!contextLoaded && contextBusy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              加载页面/模块…
            </div>
          ) : contextPages.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>页面</Label>
                <Select
                  value={createPageId}
                  onValueChange={(v) => {
                    onPageChange(v);
                    onModuleChange('');
                  }}
                  placeholder="选择页面"
                  options={contextPages.map((p) => ({
                    value: String(p.id),
                    label: p.title ? `${p.title} · ${p.route}` : p.route
                  }))}
                  className="h-10 w-full justify-between"
                />
              </div>
              <div className="space-y-2">
                <Label>模块</Label>
                <Select
                  value={createModuleId}
                  onValueChange={onModuleChange}
                  placeholder={selectedPage ? '选择模块（可选）' : '先选择页面'}
                  options={moduleOptions}
                  disabled={!selectedPage}
                  className="h-10 w-full justify-between"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground">
              项目尚未建立页面/模块结构，暂时无法设置归属。可先创建页面/模块后再回来设置。
              <div className="mt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/projects/${projectId}/context`}>前往页面/模块管理</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

export function DownloadDialog({
  open,
  onOpenChange,
  downloadLocale,
  onDownloadLocaleChange,
  downloadMode,
  onDownloadModeChange,
  localeOptions,
  sourceLocale,
  onConfirm
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloadLocale: string;
  onDownloadLocaleChange: (value: string) => void;
  downloadMode: DownloadMode;
  onDownloadModeChange: (value: DownloadMode) => void;
  localeOptions: Array<{ code: string; label: string; kind: 'source' | 'target' }>;
  sourceLocale: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Download />
          下载导出
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">下载语言包（JSON）</DialogTitle>
          <DialogDescription>导出结构保持项目模板一致。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="export-locale">语言</Label>
            <DropdownMenu
              trigger={
                <Button id="export-locale" type="button" variant="outline" className="h-10 justify-between">
                  <span className="truncate">{downloadLocale}</span>
                  <Badge variant={downloadLocale === sourceLocale ? 'secondary' : 'outline'}>
                    {downloadLocale === sourceLocale ? '源' : '目标'}
                  </Badge>
                </Button>
              }
              items={[
                {
                  type: 'radio-group',
                  value: downloadLocale,
                  onValueChange: onDownloadLocaleChange,
                  items: localeOptions.map((o) => ({
                    value: o.code,
                    label: (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-foreground">{o.label}</span>
                        <span className="text-xs text-muted-foreground">{o.code}</span>
                      </span>
                    )
                  }))
                }
              ]}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="export-mode">导出项</Label>
            <DropdownMenu
              trigger={
                <Button id="export-mode" type="button" variant="outline" className="h-10 justify-between">
                  {downloadMode === 'filled'
                    ? '仅导出已填写'
                    : downloadMode === 'empty'
                      ? '包含待翻译：空字符串'
                      : '包含待翻译：回退源文案'}
                </Button>
              }
              items={[
                {
                  type: 'radio-group',
                  value: downloadMode,
                  onValueChange: (v) => onDownloadModeChange(v as DownloadMode),
                  items: [
                    { value: 'empty', label: '包含待翻译：空字符串' },
                    { value: 'fallback', label: '包含待翻译：回退源文案' },
                    { value: 'filled', label: '仅导出已填写（有目标文案）' }
                  ]
                }
              ]}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onConfirm}>
            下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EntriesTabContent({
  query,
  onQueryChange,
  poolOnly,
  onPoolOnlyChange,
  filledFilter,
  onFilledFilterChange,
  statusFilter,
  onStatusFilterChange,
  isSource,
  filteredTotal,
  entriesError,
  entryColumns,
  pageItems,
  page,
  pageCount,
  onPageChange,
  projectId
}: {
  query: string;
  onQueryChange: (value: string) => void;
  poolOnly: boolean;
  onPoolOnlyChange: (value: boolean) => void;
  filledFilter: 'all' | 'filled' | 'empty';
  onFilledFilterChange: (value: 'all' | 'filled' | 'empty') => void;
  statusFilter: TranslationStatus | 'all';
  onStatusFilterChange: (value: TranslationStatus | 'all') => void;
  isSource: boolean;
  filteredTotal: number;
  entriesError: string;
  entryColumns: Array<TableColumn<PackagesEntry>>;
  pageItems: PackagesEntry[];
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  projectId: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="搜索 key / 文案" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DropdownMenu
            trigger={
              <Button type="button" variant="outline">
                筛选
                {poolOnly || filledFilter !== 'all' || statusFilter !== 'all' ? (
                  <Badge variant="secondary" className="ml-1">
                    已启用
                  </Badge>
                ) : null}
              </Button>
            }
            items={[
              {
                type: 'checkbox',
                label: '仅看未分类词条（未归属）',
                checked: poolOnly,
                onCheckedChange: (checked) => onPoolOnlyChange(Boolean(checked))
              },
              { type: 'separator' },
              { type: 'label', label: '填写情况' },
              {
                type: 'radio-group',
                value: filledFilter,
                onValueChange: (v) => onFilledFilterChange(v as typeof filledFilter),
                items: [
                  { value: 'all', label: '全部' },
                  { value: 'filled', label: '仅已填写' },
                  { value: 'empty', label: '仅未填写' }
                ]
              },
              { type: 'separator' },
              { type: 'label', label: '状态（目标语言）' },
              {
                type: 'radio-group',
                value: statusFilter,
                onValueChange: (v) => onStatusFilterChange(v as typeof statusFilter),
                items: [
                  { value: 'all', label: '全部', disabled: isSource },
                  { value: 'pending', label: '待翻译', disabled: isSource },
                  { value: 'needs_update', label: '待更新', disabled: isSource },
                  { value: 'needs_review', label: '待核对', disabled: isSource },
                  { value: 'ready', label: '待核对', disabled: isSource },
                  { value: 'approved', label: '已定版', disabled: isSource }
                ]
              }
            ]}
          />
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/overview`}>打开项目概览</Link>
          </Button>
        </div>
      </div>
      {entriesError ? (
        <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
          {entriesError}
        </div>
      ) : null}
      <Table columns={entryColumns} data={pageItems} rowKey="id" />
      <Pagination page={page} pageCount={pageCount} total={filteredTotal} onChange={onPageChange} />
    </div>
  );
}

export function ImportTabContent({
  selectedLocale,
  isSource,
  importBusy,
  importStage,
  importFileRef,
  importFileName,
  importFileSize,
  importPreview,
  importMap,
  importError,
  previewTab,
  onPreviewTabChange,
  onPickFile,
  onReset,
  onConfirm,
  canManage,
  contextError,
  contextLoaded,
  contextBusy,
  contextPages,
  projectId
}: {
  selectedLocale: string;
  isSource: boolean;
  importBusy: boolean;
  importStage: 'idle' | 'parsed' | 'confirmed';
  importFileRef: React.RefObject<HTMLInputElement | null>;
  importFileName: string;
  importFileSize: number | null;
  importPreview: ImportPreview | null;
  importMap: Record<string, string> | null;
  importError: string | null;
  previewTab: 'added' | 'updated' | 'ignored';
  onPreviewTabChange: (value: 'added' | 'updated' | 'ignored') => void;
  onPickFile: (file: File) => void;
  onReset: () => void;
  onConfirm: (bindPlan: ImportBindPlanDraft | null) => void;
  canManage: boolean;
  contextError: string | null;
  contextLoaded: boolean;
  contextBusy: boolean;
  contextPages: PackagesContextPageNode[];
  projectId: number;
}) {
  const hasActionableChanges = importPreview ? importPreview.summary.added + importPreview.summary.updated > 0 : false;
  const [dragActive, setDragActive] = useState(false);
  const [bindMode, setBindMode] = useState<'off' | 'single' | 'per_key'>('off');
  const [bindScope, setBindScope] = useState<'new_only' | 'all'>('new_only');

  const [singlePageMode, setSinglePageMode] = useState<'existing' | 'create'>('existing');
  const [singlePageId, setSinglePageId] = useState('');
  const [singleCreatePageRoute, setSingleCreatePageRoute] = useState('');
  const [singleCreatePageTitle, setSingleCreatePageTitle] = useState('');
  const [singleModuleMode, setSingleModuleMode] = useState<'none' | 'existing' | 'create'>('none');
  const [singleModuleId, setSingleModuleId] = useState('');
  const [singleCreateModuleName, setSingleCreateModuleName] = useState('');

  const [perKeyQuery, setPerKeyQuery] = useState('');
  const [perKeySelected, setPerKeySelected] = useState<string[]>([]);
  const [perKeyAssign, setPerKeyAssign] = useState<Record<string, { pageId: string; moduleId?: string }>>({});
  const [perKeyBulkPageId, setPerKeyBulkPageId] = useState('');
  const [perKeyBulkModuleId, setPerKeyBulkModuleId] = useState('');

  useEffect(() => {
    if (importPreview?.kind === 'target') setBindScope('all');
  }, [importPreview?.kind]);

  const effectiveScope = importPreview?.kind === 'target' ? 'all' : bindScope;

  const pageOptions = useMemo(
    () =>
      contextPages.map((p) => ({
        value: String(p.id),
        label: p.title ? `${p.title} · ${p.route}` : p.route
      })),
    [contextPages]
  );

  const getModuleOptionsByPageId = (pageId: string) => {
    const id = Number(pageId);
    if (!Number.isFinite(id)) return [];
    const page = contextPages.find((p) => p.id === id);
    if (!page) return [];
    return page.modules.map((m) => ({ value: String(m.id), label: m.name }));
  };

  const perKeyCandidates = useMemo(() => {
    if (!importPreview) return [];
    if (effectiveScope === 'new_only') {
      if (importPreview.kind !== 'source') return [];
      return importPreview.added.map((a) => ({ key: a.key, text: a.text }));
    }
    return importPreview.incomingKeys.map((k) => ({ key: k, text: importMap?.[k] ?? '' }));
  }, [effectiveScope, importMap, importPreview]);

  const perKeyPagination = useSearchPagination({
    items: perKeyCandidates,
    query: perKeyQuery,
    pageSize: 20,
    predicate: (it, q) => it.key.toLowerCase().includes(q) || it.text.toLowerCase().includes(q)
  });

  const perKeyAssignedCount = useMemo(() => {
    let count = 0;
    for (const k of perKeyCandidates.map((it) => it.key)) {
      if (perKeyAssign[k]?.pageId) count += 1;
    }
    return count;
  }, [perKeyAssign, perKeyCandidates]);

  const bindPlan = useMemo((): ImportBindPlanDraft | null => {
    if (bindMode === 'off') return null;
    if (bindMode === 'single') {
      return {
        mode: 'single',
        scope: effectiveScope,
        pageMode: singlePageMode,
        pageId: singlePageMode === 'existing' ? singlePageId : undefined,
        createPageRoute: singlePageMode === 'create' ? singleCreatePageRoute : undefined,
        createPageTitle: singlePageMode === 'create' ? singleCreatePageTitle : undefined,
        moduleMode: singleModuleMode,
        moduleId: singleModuleMode === 'existing' ? singleModuleId : undefined,
        createModuleName: singleModuleMode === 'create' ? singleCreateModuleName : undefined
      };
    }

    const items = Object.entries(perKeyAssign)
      .filter(([, v]) => v.pageId)
      .map(([key, v]) => ({ key, pageId: v.pageId, moduleId: v.moduleId }));

    return { mode: 'per_key', scope: effectiveScope, items };
  }, [
    bindMode,
    effectiveScope,
    perKeyAssign,
    singleCreateModuleName,
    singleCreatePageRoute,
    singleCreatePageTitle,
    singleModuleId,
    singleModuleMode,
    singlePageId,
    singlePageMode
  ]);

  const bindValidationError = useMemo(() => {
    if (bindMode === 'off') return null;
    if (!importPreview) return null;
    if (!contextLoaded && contextBusy) return '正在加载页面/模块，请稍后…';

    if (effectiveScope === 'new_only' && importPreview.kind === 'source' && importPreview.summary.added === 0) {
      return '本次导入没有新增词条，无需设置“新增词条归属”。如需补充已存在词条的归属，请切换为“包含已存在词条”。';
    }

    if (bindMode === 'single') {
      if (singlePageMode === 'existing') {
        if (!contextLoaded) return '页面/模块尚未加载，请稍后或重试。';
        if (!singlePageId) return '请选择页面。';
      } else {
        if (!singleCreatePageRoute.trim()) return '请输入新建页面路由/标识。';
      }

      if (singleModuleMode === 'existing' && !singleModuleId) return '请选择模块。';
      if (singleModuleMode === 'create' && !singleCreateModuleName.trim()) return '请输入新建模块名称。';
    }

    return null;
  }, [
    bindMode,
    contextBusy,
    contextLoaded,
    effectiveScope,
    importPreview,
    singleCreateModuleName,
    singleCreatePageRoute,
    singleModuleId,
    singleModuleMode,
    singlePageId,
    singlePageMode
  ]);

  const canConfirmImport =
    canManage &&
    importStage === 'parsed' &&
    hasActionableChanges &&
    !importBusy &&
    !bindValidationError;

  const showBindPlanInUpdated =
    importPreview?.kind === 'target' || (importPreview?.kind === 'source' && importPreview.summary.added === 0);

  const bindPlanPanel = importPreview ? (
    <div className="rounded-md border bg-background p-4">
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">页面归属（可选）</div>
        <div className="text-sm text-muted-foreground">把本次导入的词条关联到页面/模块，方便后续按页面维护。</div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>归属方式</Label>
            <Select
              value={bindMode}
              onValueChange={(v) => setBindMode(v as typeof bindMode)}
              placeholder="选择归属方式"
              options={[
                { value: 'off', label: '不设置归属' },
                { value: 'single', label: '统一归属到同一页面/模块' },
                { value: 'per_key', label: '为不同词条分配归属' }
              ]}
              className="h-10 w-full justify-between"
            />
          </div>
          <div className="space-y-2">
            <Label>适用范围</Label>
            <Select
              value={effectiveScope}
              onValueChange={(v) => setBindScope(v as typeof bindScope)}
              placeholder="选择适用范围"
              options={[
                { value: 'new_only', label: '仅本次新增词条（推荐）' },
                { value: 'all', label: '包含已存在词条（可选）' }
              ]}
              disabled={importPreview?.kind === 'target'}
              className="h-10 w-full justify-between"
            />
            {importPreview?.kind === 'target' ? (
              <div className="text-xs text-muted-foreground">目标语言导入不会新增词条，如需归属，等同于“包含已存在词条”。</div>
            ) : null}
          </div>
          <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
            默认只为新增词条设置归属；未分配的词条也可稍后在页面/模块里再关联。
          </div>
        </div>

        {bindMode !== 'off' ? (
          <div className="space-y-3">
            {contextError ? (
              <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
                {contextError}
              </div>
            ) : null}

            {(() => {
              if (!contextLoaded && contextBusy) {
                return (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    加载页面/模块…
                  </div>
                );
              }

              if (!contextLoaded) {
                return (
                  <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                    页面/模块信息尚未加载完成，稍后会自动展示归属选项。
                  </div>
                );
              }

              if (bindMode === 'single') {
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>页面来源</Label>
                        <Select
                          value={singlePageMode}
                          onValueChange={(v) => {
                            setSinglePageMode(v as typeof singlePageMode);
                            setSinglePageId('');
                            setSingleCreatePageRoute('');
                            setSingleCreatePageTitle('');
                            setSingleModuleId('');
                            setSingleCreateModuleName('');
                          }}
                          placeholder="选择页面来源"
                          options={[
                            { value: 'existing', label: '选择已有页面' },
                            { value: 'create', label: '导入时新建页面' }
                          ]}
                          className="h-10 w-full justify-between"
                        />
                      </div>
                      {singlePageMode === 'existing' ? (
                        <div className="space-y-2">
                          <Label>页面</Label>
                          <Select
                            value={singlePageId}
                            onValueChange={(v) => {
                              setSinglePageId(v);
                              setSingleModuleId('');
                            }}
                            placeholder={contextPages.length ? '选择页面' : '暂无页面'}
                            options={pageOptions}
                            disabled={contextPages.length === 0}
                            className="h-10 w-full justify-between"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>新建页面路由/标识</Label>
                          <Input
                            value={singleCreatePageRoute}
                            onChange={(e) => setSingleCreatePageRoute(e.target.value)}
                            placeholder="例如 /order 或 order"
                          />
                        </div>
                      )}
                    </div>

                    {singlePageMode === 'create' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>页面标题（可选）</Label>
                          <Input
                            value={singleCreatePageTitle}
                            onChange={(e) => setSingleCreatePageTitle(e.target.value)}
                            placeholder="例如 订单页"
                          />
                        </div>
                        <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                          页面会在“确认导入”时创建；若路由重复将提示冲突。
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>模块（可选）</Label>
                        <Select
                          value={singleModuleMode}
                          onValueChange={(v) => {
                            setSingleModuleMode(v as typeof singleModuleMode);
                            setSingleModuleId('');
                            setSingleCreateModuleName('');
                          }}
                          placeholder="选择模块设置"
                          options={[
                            { value: 'none', label: '不设置模块（仅归属到页面）' },
                            { value: 'existing', label: '选择已有模块' },
                            { value: 'create', label: '导入时新建模块' }
                          ]}
                          className="h-10 w-full justify-between"
                        />
                      </div>

                      {singleModuleMode === 'existing' ? (
                        <div className="space-y-2">
                          <Label>模块</Label>
                          <Select
                            value={singleModuleId}
                            onValueChange={setSingleModuleId}
                            placeholder={singlePageId ? '选择模块' : singlePageMode === 'create' ? '新建页面后再选择模块' : '先选择页面'}
                            options={getModuleOptionsByPageId(singlePageId)}
                            disabled={!singlePageId || getModuleOptionsByPageId(singlePageId).length === 0}
                            className="h-10 w-full justify-between"
                          />
                        </div>
                      ) : singleModuleMode === 'create' ? (
                        <div className="space-y-2">
                          <Label>新建模块名称</Label>
                          <Input
                            value={singleCreateModuleName}
                            onChange={(e) => setSingleCreateModuleName(e.target.value)}
                            placeholder="例如 Header / Main / Footer"
                          />
                        </div>
                      ) : (
                        <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                          不设置模块时，会将词条归属到所选页面。
                        </div>
                      )}
                    </div>

                    {contextPages.length === 0 && singlePageMode === 'existing' ? (
                      <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground">
                        项目尚未建立页面/模块结构；可切换为“导入时新建页面”，或先创建页面/模块后再回来导入。
                        <div className="mt-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/projects/${projectId}/context`}>前往页面/模块管理</Link>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {effectiveScope === 'new_only' && importPreview?.kind === 'source' && importPreview.summary.added === 0 ? (
                    <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                      本次导入没有新增词条；如需补充已存在词条的归属，请切换为“包含已存在词条”。
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid w-full gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>批量页面</Label>
                        <Select
                          value={perKeyBulkPageId}
                          onValueChange={(v) => {
                            setPerKeyBulkPageId(v);
                            setPerKeyBulkModuleId('');
                          }}
                          placeholder="选择页面"
                          options={pageOptions}
                          className="h-10 w-full justify-between"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>批量模块（可选）</Label>
                        <Select
                          value={perKeyBulkModuleId || undefined}
                          onValueChange={(v) => setPerKeyBulkModuleId(v)}
                          placeholder="不选择模块"
                          options={getModuleOptionsByPageId(perKeyBulkPageId)}
                          disabled={!perKeyBulkPageId || getModuleOptionsByPageId(perKeyBulkPageId).length === 0}
                          className="h-10 w-full justify-between"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>搜索</Label>
                        <Input value={perKeyQuery} onChange={(e) => setPerKeyQuery(e.target.value)} placeholder="搜索 key / 文案" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 lg:justify-end">
                      <div className="text-sm text-muted-foreground">
                        已分配 {perKeyAssignedCount} / {perKeyCandidates.length}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!perKeyBulkPageId || perKeySelected.length === 0}
                        onClick={() => {
                          setPerKeyAssign((prev) => {
                            const next = { ...prev };
                            for (const key of perKeySelected) {
                              next[key] = {
                                pageId: perKeyBulkPageId,
                                moduleId: perKeyBulkModuleId || undefined
                              };
                            }
                            return next;
                          });
                        }}
                      >
                        应用到已选（{perKeySelected.length}）
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border">
                    <Table
                      columns={[
                        {
                          key: 'select',
                          title: (
                            <Checkbox
                              checked={
                                perKeyPagination.pageItems.length > 0 &&
                                perKeyPagination.pageItems.every((it) => perKeySelected.includes(it.key))
                              }
                              onCheckedChange={(checked) => {
                                const keys = perKeyPagination.pageItems.map((it) => it.key);
                                setPerKeySelected((prev) => {
                                  const set = new Set(prev);
                                  if (checked) keys.forEach((k) => set.add(k));
                                  else keys.forEach((k) => set.delete(k));
                                  return Array.from(set);
                                });
                              }}
                            />
                          ),
                          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                          cellClassName: 'px-3 py-2 align-top',
                          render: (_value: unknown, record: any) => (
                            <Checkbox
                              checked={perKeySelected.includes(record.key)}
                              onCheckedChange={(checked) => {
                                setPerKeySelected((prev) => {
                                  const set = new Set(prev);
                                  if (checked) set.add(record.key);
                                  else set.delete(record.key);
                                  return Array.from(set);
                                });
                              }}
                            />
                          )
                        },
                        {
                          key: 'key',
                          title: '词条标识',
                          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                          cellClassName: 'px-3 py-2 align-top',
                          render: (_value: unknown, record: any) => (
                            <code className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground">
                              {record.key}
                            </code>
                          )
                        },
                        {
                          key: 'text',
                          title: isSource ? '原文' : '翻译内容',
                          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                          cellClassName: 'px-3 py-2 align-top text-foreground',
                          render: (_value: unknown, record: any) => (
                            <div className="max-w-[420px] break-words">{record.text || '—'}</div>
                          )
                        },
                        {
                          key: 'page',
                          title: '页面',
                          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                          cellClassName: 'px-3 py-2 align-top',
                          render: (_value: unknown, record: any) => (
                            <Select
                              value={perKeyAssign[record.key]?.pageId || undefined}
                              onValueChange={(v) => {
                                setPerKeyAssign((prev) => ({
                                  ...prev,
                                  [record.key]: { pageId: v }
                                }));
                              }}
                              placeholder="选择页面"
                              options={pageOptions}
                              className="h-9 w-[260px] justify-between"
                            />
                          )
                        },
                        {
                          key: 'module',
                          title: '模块（可选）',
                          headerClassName: 'bg-card px-3 py-2 text-left font-medium text-muted-foreground',
                          cellClassName: 'px-3 py-2 align-top',
                          render: (_value: unknown, record: any) => {
                            const pageId = perKeyAssign[record.key]?.pageId || '';
                            const options = getModuleOptionsByPageId(pageId);
                            return (
                              <div className="flex items-center gap-2">
                                <Select
                                  value={perKeyAssign[record.key]?.moduleId || undefined}
                                  onValueChange={(v) => {
                                    setPerKeyAssign((prev) => ({
                                      ...prev,
                                      [record.key]: { ...prev[record.key], moduleId: v }
                                    }));
                                  }}
                                  placeholder="不选择模块"
                                  options={options}
                                  disabled={!pageId || options.length === 0}
                                  className="h-9 w-[220px] justify-between"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  disabled={!perKeyAssign[record.key]?.moduleId}
                                  onClick={() => {
                                    setPerKeyAssign((prev) => ({
                                      ...prev,
                                      [record.key]: { ...prev[record.key], moduleId: undefined }
                                    }));
                                  }}
                                >
                                  清除
                                </Button>
                              </div>
                            );
                          }
                        }
                      ]}
                      data={perKeyPagination.pageItems as any[]}
                      rowKey="key"
                      emptyText={effectiveScope === 'new_only' ? '本次没有可分配归属的新增词条' : '暂无可分配项'}
                    />
                  </div>
                  <Pagination
                    page={perKeyPagination.page}
                    pageCount={perKeyPagination.pageCount}
                    total={perKeyPagination.filteredTotal}
                    onChange={perKeyPagination.setPage}
                  />
                </div>
              );
            })()}

            {bindValidationError ? (
              <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
                {bindValidationError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div
        className={cn('rounded-lg border bg-card p-4 transition-colors', dragActive ? 'border-primary/40 bg-primary/5' : '')}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (importBusy) return;
          setDragActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (importBusy) return;
          setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          if (importBusy) return;
          const file = e.dataTransfer.files?.[0];
          if (file) onPickFile(file);
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">导入语言包（JSON）</div>
            <div className="text-sm text-muted-foreground">
              当前语言：{selectedLocale}{' '}
              <Badge variant={isSource ? 'secondary' : 'outline'}>{isSource ? '默认语言' : '翻译语言'}</Badge>
            </div>
            {isSource ? (
              <div className="text-sm text-muted-foreground">会新增新词条并更新已有原文；不会删除未出现在文件里的词条。</div>
            ) : (
              <div className="text-sm text-muted-foreground">
                只更新已存在词条的翻译内容；不会新增词条；空白值会跳过，不会清空已有翻译。
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" disabled={importBusy} onClick={() => importFileRef.current?.click()}>
              <Upload />
              选择文件
            </Button>
            <Button type="button" variant="outline" disabled={importBusy || importStage === 'idle'} onClick={onReset}>
              重新选择
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onPickFile(file);
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>文件：{importFileName || '未选择'}</span>
          {importFileSize !== null ? <span>大小：{Math.ceil(importFileSize / 1024)} KB</span> : null}
          <span className="text-xs">也可以将 JSON 文件拖拽到此卡片</span>
          {importPreview ? (
            <span>
              解析：{importPreview.shape === 'tree' ? '树形' : '扁平'} · 新增 {importPreview.summary.added} · 修改{' '}
              {importPreview.summary.updated}
              {importPreview.kind === 'target' && importPreview.summary.ignored > 0 ? (
                <> · 忽略 {importPreview.summary.ignored}</>
              ) : null}
            </span>
          ) : null}
        </div>

        {importError ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
            {importError}
          </div>
        ) : null}
      </div>

      {importPreview ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">变更预览</div>
              <div className="mt-1 text-sm text-muted-foreground">先预览，再确认导入；返回/重新选择不会产生数据变更。</div>
            </div>
            <Button
              type="button"
              disabled={!canConfirmImport}
              onClick={() => onConfirm(bindPlan)}
            >
              {importBusy ? <Loader2 className="animate-spin" /> : null}
              确认导入
            </Button>
          </div>

          <div className="mt-4">
            {(() => {
              const items =
                importPreview.kind === 'source'
                  ? ([
                      {
                        value: 'added',
                        label: (
                          <span className="flex items-center gap-2">
                            新增 <Badge variant="secondary">{importPreview.summary.added}</Badge>
                          </span>
                        ),
                        disabled: importPreview.summary.added === 0,
                        content: (
                          <div className="space-y-4">
                            {bindPlanPanel}
                            <PreviewTable kind="added" items={importPreview.added} emptyText="无新增项" />
                          </div>
                        )
                      },
                      {
                        value: 'updated',
                        label: (
                          <span className="flex items-center gap-2">
                            修改 <Badge variant="secondary">{importPreview.summary.updated}</Badge>
                          </span>
                        ),
                        disabled: importPreview.summary.updated === 0,
                        content: showBindPlanInUpdated ? (
                          <div className="space-y-4">
                            {bindPlanPanel}
                            <PreviewTable kind="updated" items={importPreview.updated} emptyText="无修改项" />
                          </div>
                        ) : (
                          <PreviewTable kind="updated" items={importPreview.updated} emptyText="无修改项" />
                        )
                      }
                    ] as const)
                  : ([
                      {
                        value: 'updated',
                        label: (
                          <span className="flex items-center gap-2">
                            修改 <Badge variant="secondary">{importPreview.summary.updated}</Badge>
                          </span>
                        ),
                        disabled: importPreview.summary.updated === 0,
                        content: (
                          <div className="space-y-4">
                            {bindPlanPanel}
                            <PreviewTable kind="updated" items={importPreview.updated} emptyText="无修改项" />
                          </div>
                        )
                      },
                      ...(importPreview.summary.ignored > 0
                        ? ([
                            {
                              value: 'ignored',
                              label: (
                                <span className="flex items-center gap-2">
                                  忽略 <Badge variant="secondary">{importPreview.summary.ignored}</Badge>
                                </span>
                              ),
                              disabled: importPreview.summary.ignored === 0,
                              content: <PreviewTable kind="ignored" items={importPreview.ignored} emptyText="无忽略项" />
                            }
                          ] as const)
                        : [])
                    ] as const);

              const safeTab = items.some((i) => i.value === previewTab) ? previewTab : items[0].value;

              return (
                <Tabs
                  value={safeTab}
                  onValueChange={(v) => onPreviewTabChange(v as typeof safeTab)}
                  items={items as any}
                />
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          选择 JSON 文件后，将在此处展示变更预览（新增/修改；目标语言可能出现忽略项）。
        </div>
      )}
    </div>
  );
}

export type ImportBindPlanDraft =
  | {
      mode: 'single';
      scope: 'new_only' | 'all';
      pageMode: 'existing' | 'create';
      pageId?: string;
      createPageRoute?: string;
      createPageTitle?: string;
      moduleMode: 'none' | 'existing' | 'create';
      moduleId?: string;
      createModuleName?: string;
    }
  | {
      mode: 'per_key';
      scope: 'new_only' | 'all';
      items: Array<{ key: string; pageId: string; moduleId?: string }>;
    };

export function HistoryTabContent({
  historyQuery,
  onHistoryQueryChange,
  historyBusy,
  historyError,
  onRefresh,
  historyColumns,
  historyPageItems,
  historyPage,
  historyPageCount,
  historyFilteredTotal,
  onPageChange,
  contextLink
}: {
  historyQuery: string;
  onHistoryQueryChange: (value: string) => void;
  historyBusy: boolean;
  historyError: string | null;
  onRefresh: () => void;
  historyColumns: Array<TableColumn<PackagesUploadHistoryItem>>;
  historyPageItems: PackagesUploadHistoryItem[];
  historyPage: number;
  historyPageCount: number;
  historyFilteredTotal: number;
  onPageChange: (page: number) => void;
  contextLink: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <Input value={historyQuery} onChange={(e) => onHistoryQueryChange(e.target.value)} placeholder="搜索语言 / 操作者 / 时间" />
        </div>
        <div className="flex items-center justify-end gap-2">
          {contextLink ? (
            <Button asChild type="button" variant="outline" disabled={historyBusy}>
              <Link href={contextLink}>查看绑定结果</Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={historyBusy} onClick={onRefresh}>
            {historyBusy ? <Loader2 className="animate-spin" /> : <RefreshCcw />}
            刷新
          </Button>
        </div>
      </div>

      {historyError ? (
        <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
          {historyError}
        </div>
      ) : null}

      <Table columns={historyColumns} data={historyPageItems} rowKey="id" emptyText={historyBusy ? '加载中…' : '暂无上传记录'} />

      <Pagination page={historyPage} pageCount={historyPageCount} total={historyFilteredTotal} onChange={onPageChange} pending={historyBusy} />
    </div>
  );
}
