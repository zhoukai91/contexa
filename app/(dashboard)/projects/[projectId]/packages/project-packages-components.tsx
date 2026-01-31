'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Download, Eye, Loader2, Plus, RefreshCcw, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
                <Link href={`/projects/${projectId}/context`}>去 06 按页面维护</Link>
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
                    去 05 预置筛选
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
              项目尚未建立页面/模块结构，归属选择不可用。可前往 06 创建页面/模块后再回来设置。
              <div className="mt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/projects/${projectId}/context`}>前往 06 页面/上下文</Link>
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
                label: '仅看词条池（未归属）',
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
                  { value: 'ready', label: '待核对（ready）', disabled: isSource },
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
  importError,
  previewTab,
  onPreviewTabChange,
  onPickFile,
  onReset,
  onConfirm,
  canManage,
  canConfirm,
  bindLevel,
  onBindLevelChange,
  bindMode,
  onBindModeChange,
  contextError,
  contextLoaded,
  contextBusy,
  contextPages,
  pageMode,
  onPageModeChange,
  pageId,
  onPageIdChange,
  createPageRoute,
  onCreatePageRouteChange,
  createPageTitle,
  onCreatePageTitleChange,
  moduleMode,
  onModuleModeChange,
  moduleId,
  onModuleIdChange,
  createModuleName,
  onCreateModuleNameChange,
  selectedPage,
  moduleOptions,
  projectId,
  bindValidationError,
  bindWarning
}: {
  selectedLocale: string;
  isSource: boolean;
  importBusy: boolean;
  importStage: 'idle' | 'parsed' | 'confirmed';
  importFileRef: React.RefObject<HTMLInputElement | null>;
  importFileName: string;
  importFileSize: number | null;
  importPreview: ImportPreview | null;
  importError: string | null;
  previewTab: 'added' | 'updated' | 'ignored';
  onPreviewTabChange: (value: 'added' | 'updated' | 'ignored') => void;
  onPickFile: (file: File) => void;
  onReset: () => void;
  onConfirm: () => void;
  canManage: boolean;
  canConfirm: boolean;
  bindLevel: 'off' | 'page' | 'module';
  onBindLevelChange: (value: 'off' | 'page' | 'module') => void;
  bindMode: 'all' | 'addedOnly';
  onBindModeChange: (value: 'all' | 'addedOnly') => void;
  contextError: string | null;
  contextLoaded: boolean;
  contextBusy: boolean;
  contextPages: PackagesContextPageNode[];
  pageMode: 'existing' | 'create';
  onPageModeChange: (value: 'existing' | 'create') => void;
  pageId: string;
  onPageIdChange: (value: string) => void;
  createPageRoute: string;
  onCreatePageRouteChange: (value: string) => void;
  createPageTitle: string;
  onCreatePageTitleChange: (value: string) => void;
  moduleMode: 'existing' | 'create';
  onModuleModeChange: (value: 'existing' | 'create') => void;
  moduleId: string;
  onModuleIdChange: (value: string) => void;
  createModuleName: string;
  onCreateModuleNameChange: (value: string) => void;
  selectedPage: PackagesContextPageNode | null;
  moduleOptions: Array<{ value: string; label: string }>;
  projectId: number;
  bindValidationError: string | null;
  bindWarning: string | null;
}) {
  const hasActionableChanges = importPreview ? importPreview.summary.added + importPreview.summary.updated > 0 : false;
  const [dragActive, setDragActive] = useState(false);
  const bindHint = useMemo(() => {
    if (bindLevel === 'off') return null;

    const pageLabel =
      pageMode === 'create'
        ? createPageRoute.trim()
          ? `新建页面 ${createPageRoute.trim()}`
          : '新建页面'
        : selectedPage
          ? selectedPage.title
            ? `${selectedPage.title} · ${selectedPage.route}`
            : selectedPage.route
          : '未选择页面';

    if (bindLevel === 'page') return `导入后将自动绑定到：${pageLabel}`;

    const moduleLabel =
      moduleMode === 'create'
        ? createModuleName.trim()
          ? `新建模块 ${createModuleName.trim()}`
          : '新建模块'
        : moduleId
          ? moduleOptions.find((m) => m.value === moduleId)?.label ?? '已选择模块'
          : '未选择模块';

    return `导入后将自动绑定到：${pageLabel} / ${moduleLabel}`;
  }, [bindLevel, createModuleName, createPageRoute, moduleId, moduleMode, moduleOptions, pageMode, selectedPage]);

  const bindCountHint = useMemo(() => {
    if (!importPreview || bindLevel === 'off') return null;
    if (bindMode === 'addedOnly' && importPreview.kind === 'source') return `绑定范围：仅新增 ${importPreview.summary.added} 条`;
    return `绑定范围：导入文件中的 ${importPreview.incomingTotal} 条 key（存在的 + 新增的）`;
  }, [bindLevel, bindMode, importPreview]);

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
            <div className="text-sm font-semibold text-foreground">导入上下文</div>
            <div className="text-sm text-muted-foreground">
              当前语言：{selectedLocale} <Badge variant={isSource ? 'secondary' : 'outline'}>{isSource ? '源语言' : '目标语言'}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">结构支持扁平或树形；系统以叶子节点路径作为词条 key（例如 order.title）。</div>
            <div className="text-sm text-muted-foreground">value 必须为字符串；树形 JSON 不支持数组；key 去除首尾空格后为空或冲突会导致解析失败。</div>
            {isSource ? (
              <div className="text-sm text-muted-foreground">
                源语言导入：允许新增 key、允许更新源文案；仅处理导入文件中出现的 key，未出现的 key 不会删除或变更。
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                目标语言导入：仅更新已存在 key 的译文，不会新增词条；源语言不存在的 key 会显示在「忽略」中且不会写入；空白值会跳过，不会清空现有译文；与现有译文一致视为无变更。
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

      <div className="rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">归属设置</div>
          <div className="text-sm text-muted-foreground">可在导入时把本次导入涉及的词条直接关联到页面/模块。</div>
          {bindHint ? <div className="text-sm text-muted-foreground">{bindHint}</div> : null}
          {bindCountHint ? <div className="text-sm text-muted-foreground">{bindCountHint}</div> : null}
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>自动绑定</Label>
              <Select
                value={bindLevel}
                onValueChange={(v) => onBindLevelChange(v as typeof bindLevel)}
                placeholder="选择绑定方式"
                options={[
                  { value: 'off', label: '不绑定（仅导入词条/译文）' },
                  { value: 'page', label: '绑定到页面' },
                  { value: 'module', label: '绑定到页面 + 模块' }
                ]}
                className="h-10 w-full justify-between"
              />
            </div>
            <div className="space-y-2">
              <Label>绑定范围</Label>
              <Select
                value={bindMode}
                onValueChange={(v) => onBindModeChange(v as typeof bindMode)}
                placeholder="选择范围"
                options={[
                  { value: 'all', label: '导入文件中的所有 key（推荐）' },
                  { value: 'addedOnly', label: '仅新增 key（避免误绑定共享词条）' }
                ]}
                disabled={!isSource}
                className="h-10 w-full justify-between"
              />
              {!isSource ? <div className="text-xs text-muted-foreground">目标语言导入不会新增 key，仅支持“所有 key”。</div> : null}
            </div>
          </div>

          {bindLevel !== 'off' ? (
            <div className="space-y-3">
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
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>页面来源</Label>
                      <Select
                        value={pageMode}
                        onValueChange={(v) => onPageModeChange(v as typeof pageMode)}
                        placeholder="选择页面来源"
                        options={[
                          { value: 'existing', label: '选择已有页面' },
                          { value: 'create', label: '导入时新建页面' }
                        ]}
                        className="h-10 w-full justify-between"
                      />
                    </div>
                    {pageMode === 'existing' ? (
                      <div className="space-y-2">
                        <Label>页面</Label>
                        <Select
                          value={pageId}
                          onValueChange={(v) => {
                            onPageIdChange(v);
                            onModuleIdChange('');
                          }}
                          placeholder={contextPages.length ? '选择页面' : '暂无页面'}
                          options={contextPages.map((p) => ({
                            value: String(p.id),
                            label: p.title ? `${p.title} · ${p.route}` : p.route
                          }))}
                          disabled={contextPages.length === 0}
                          className="h-10 w-full justify-between"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>新建页面路由/标识</Label>
                        <Input
                          value={createPageRoute}
                          onChange={(e) => onCreatePageRouteChange(e.target.value)}
                          placeholder="例如 /order 或 order"
                        />
                      </div>
                    )}
                  </div>

                  {pageMode === 'create' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>页面标题（可选）</Label>
                        <Input
                          value={createPageTitle}
                          onChange={(e) => onCreatePageTitleChange(e.target.value)}
                          placeholder="例如 订单页"
                        />
                      </div>
                      <div className="rounded-md border bg-background p-3 text-xs text-muted-foreground">
                        页面会在“确认导入”时创建；若路由重复将提示冲突。
                      </div>
                    </div>
                  ) : null}

                  {bindLevel === 'module' ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>模块来源</Label>
                          <Select
                            value={moduleMode}
                            onValueChange={(v) => onModuleModeChange(v as typeof moduleMode)}
                            placeholder="选择模块来源"
                            options={[
                              { value: 'existing', label: '选择已有模块' },
                              { value: 'create', label: '导入时新建模块' }
                            ]}
                            className="h-10 w-full justify-between"
                          />
                        </div>
                        {moduleMode === 'existing' ? (
                          <div className="space-y-2">
                            <Label>模块</Label>
                            <Select
                              value={moduleId}
                              onValueChange={onModuleIdChange}
                              placeholder={selectedPage ? '选择模块' : pageMode === 'create' ? '新建页面后再选择模块' : '先选择页面'}
                              options={moduleOptions}
                              disabled={!selectedPage || moduleOptions.length === 0}
                              className="h-10 w-full justify-between"
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Label>新建模块名称</Label>
                            <Input
                              value={createModuleName}
                              onChange={(e) => onCreateModuleNameChange(e.target.value)}
                              placeholder="例如 Header / Main / Footer"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {contextPages.length === 0 && pageMode === 'existing' ? (
                    <div className="rounded-md border bg-card p-3 text-sm text-muted-foreground">
                      项目尚未建立页面/模块结构；可切换为“导入时新建页面”，或前往 06 创建页面/模块后再回来导入。
                      <div className="mt-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/projects/${projectId}/context`}>前往 06 页面/上下文</Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {bindValidationError ? (
                <div className="rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive">
                  {bindValidationError}
                </div>
              ) : null}
              {bindWarning ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                  {bindWarning}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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
              disabled={importBusy || importStage !== 'parsed' || !canManage || !hasActionableChanges || !canConfirm}
              onClick={onConfirm}
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
                        content: <PreviewTable kind="added" items={importPreview.added} emptyText="无新增项" />
                      },
                      {
                        value: 'updated',
                        label: (
                          <span className="flex items-center gap-2">
                            修改 <Badge variant="secondary">{importPreview.summary.updated}</Badge>
                          </span>
                        ),
                        disabled: importPreview.summary.updated === 0,
                        content: <PreviewTable kind="updated" items={importPreview.updated} emptyText="无修改项" />
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
                        content: <PreviewTable kind="updated" items={importPreview.updated} emptyText="无修改项" />
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
