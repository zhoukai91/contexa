'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type GlossaryType = 'recommended' | 'forced';
type GlossaryStatus = 'enabled' | 'disabled';

type GlossaryItem = {
  id: string;
  locale: string;
  source: string;
  target: string;
  type: GlossaryType;
  status: GlossaryStatus;
  note: string;
  updatedAt: number;
  updatedBy: string;
};

type FilterType = 'all' | GlossaryType;
type FilterStatus = 'all' | GlossaryStatus;

function formatUpdatedAt(ts: number) {
  return new Date(ts).toLocaleString(undefined, { hour12: false });
}

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function createMockItems(now: number): GlossaryItem[] {
  return [
    {
      id: 'g-001',
      locale: 'en',
      source: '语境',
      target: 'context',
      type: 'recommended',
      status: 'enabled',
      note: '优先使用 context，避免 scene 造成歧义。',
      updatedAt: now - 1000 * 60 * 40,
      updatedBy: 'Alice'
    },
    {
      id: 'g-002',
      locale: 'en',
      source: '词条',
      target: 'entry',
      type: 'forced',
      status: 'enabled',
      note: '文档与 UI 中统一使用 entry。',
      updatedAt: now - 1000 * 60 * 120,
      updatedBy: 'Bob'
    },
    {
      id: 'g-003',
      locale: 'en',
      source: '页面',
      target: 'page',
      type: 'recommended',
      status: 'disabled',
      note: '早期项目曾用 screen，现已逐步统一。',
      updatedAt: now - 1000 * 60 * 60 * 12,
      updatedBy: 'Carol'
    },
    {
      id: 'g-004',
      locale: 'ja',
      source: '术语库',
      target: '用語集',
      type: 'recommended',
      status: 'enabled',
      note: '与 UI 导航命名一致。',
      updatedAt: now - 1000 * 60 * 25,
      updatedBy: 'Daisuke'
    },
    {
      id: 'g-005',
      locale: 'ja',
      source: '强制',
      target: '必須',
      type: 'forced',
      status: 'enabled',
      note: '强制类提示语使用「必須」。',
      updatedAt: now - 1000 * 60 * 180,
      updatedBy: 'Eri'
    },
    {
      id: 'g-006',
      locale: 'zh-TW',
      source: '目标语言',
      target: '目標語言',
      type: 'recommended',
      status: 'enabled',
      note: '繁体中文统一用「目標」。',
      updatedAt: now - 1000 * 60 * 90,
      updatedBy: 'Frank'
    }
  ];
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProjectGlossaryClient({ projectId }: { projectId: number }) {
  const t = useTranslations('projectGlossary');
  const { push } = useToast();

  const targetLocales = useMemo(() => ['en', 'ja', 'zh-TW'], []);
  const canManage = true;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [locale, setLocale] = useState<string>(() => targetLocales[0] ?? '');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [items, setItems] = useState<GlossaryItem[]>(() =>
    createMockItems(Date.now())
  );

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    source: '',
    target: '',
    type: 'recommended' as GlossaryType,
    status: 'enabled' as GlossaryStatus,
    note: ''
  });
  const [formError, setFormError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(false);
    }, 280);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return items
      .filter((it) => it.locale === locale)
      .filter((it) => (typeFilter === 'all' ? true : it.type === typeFilter))
      .filter((it) => (statusFilter === 'all' ? true : it.status === statusFilter))
      .filter((it) => {
        if (!q) return true;
        const haystack = normalizeText(`${it.source} ${it.target} ${it.note}`);
        return haystack.includes(q);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, locale, query, statusFilter, typeFilter]);

  const selectedCountInView = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    const ids = new Set(filtered.map((it) => it.id));
    let count = 0;
    selectedIds.forEach((id) => {
      if (ids.has(id)) count += 1;
    });
    return count;
  }, [filtered, selectedIds]);

  const allChecked = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.every((it) => selectedIds.has(it.id));
  }, [filtered, selectedIds]);

  const isIndeterminate = useMemo(() => {
    if (filtered.length === 0) return false;
    const checked = filtered.filter((it) => selectedIds.has(it.id)).length;
    return checked > 0 && checked < filtered.length;
  }, [filtered, selectedIds]);

  function openCreate() {
    setEditingId(null);
    setForm({ source: '', target: '', type: 'recommended', status: 'enabled', note: '' });
    setFormError('');
    setEditOpen(true);
  }

  function openEdit(id: string) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    setEditingId(id);
    setForm({
      source: it.source,
      target: it.target,
      type: it.type,
      status: it.status,
      note: it.note
    });
    setFormError('');
    setEditOpen(true);
  }

  function validateUniqueness(nextSource: string) {
    const normalized = normalizeText(nextSource);
    if (!normalized) return null;
    return items.find(
      (it) =>
        it.locale === locale &&
        normalizeText(it.source) === normalized &&
        it.id !== editingId
    );
  }

  function saveItem() {
    setFormError('');
    if (!form.source.trim() || !form.target.trim()) {
      setFormError(t('formRequiredError'));
      return;
    }

    const conflict = validateUniqueness(form.source);
    if (conflict) {
      setFormError(
        t('formConflictError', {
          source: conflict.source,
          target: conflict.target
        })
      );
      return;
    }

    const now = Date.now();
    const updatedBy = '你';

    if (editingId) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === editingId
            ? {
                ...it,
                source: form.source.trim(),
                target: form.target.trim(),
                type: form.type,
                status: form.status,
                note: form.note.trim(),
                updatedAt: now,
                updatedBy
              }
            : it
        )
      );
      push({
        title: t('toastSavedTitle'),
        message: t('toastSavedMessage'),
        variant: 'default'
      });
    } else {
      const newItem: GlossaryItem = {
        id: makeId(),
        locale,
        source: form.source.trim(),
        target: form.target.trim(),
        type: form.type,
        status: form.status,
        note: form.note.trim(),
        updatedAt: now,
        updatedBy
      };
      setItems((prev) => [newItem, ...prev]);
      push({
        title: t('toastCreatedTitle'),
        message: t('toastCreatedMessage'),
        variant: 'default'
      });
    }

    setEditOpen(false);
  }

  function toggleItemStatus(id: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              status: it.status === 'enabled' ? 'disabled' : 'enabled',
              updatedAt: Date.now(),
              updatedBy: '你'
            }
          : it
      )
    );
  }

  function requestDelete(ids: string[]) {
    setDeleteIds(ids);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    const ids = new Set(deleteIds);
    setItems((prev) => prev.filter((it) => !ids.has(it.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      deleteIds.forEach((id) => next.delete(id));
      return next;
    });
    setDeleteOpen(false);
    setDeleteIds([]);
    push({
      title: t('toastDeletedTitle'),
      message: t('toastDeletedMessage'),
      variant: 'default'
    });
  }

  function toggleAllInView(nextChecked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (nextChecked) {
        filtered.forEach((it) => next.add(it.id));
      } else {
        filtered.forEach((it) => next.delete(it.id));
      }
      return next;
    });
  }

  function toggleOne(id: string, nextChecked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (nextChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function bulkSetStatus(nextStatus: GlossaryStatus) {
    const ids = new Set(
      filtered.filter((it) => selectedIds.has(it.id)).map((it) => it.id)
    );
    if (ids.size === 0) return;
    const now = Date.now();
    setItems((prev) =>
      prev.map((it) =>
        ids.has(it.id)
          ? { ...it, status: nextStatus, updatedAt: now, updatedBy: '你' }
          : it
      )
    );
    push({
      title: t('toastBatchUpdatedTitle'),
      message: t('toastBatchUpdatedMessage', { count: ids.size }),
      variant: 'default'
    });
  }

  if (targetLocales.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('emptyTargetLocalesTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">{t('emptyTargetLocalesDesc')}</div>
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/settings/locales`}>{t('goToLocales')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="glossary-locale">{t('targetLocale')}</Label>
                <select
                  id="glossary-locale"
                  value={locale}
                  onChange={(e) => {
                    setLocale(e.target.value);
                    setSelectedIds(new Set());
                  }}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  {targetLocales.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="glossary-type">{t('filterType')}</Label>
                <select
                  id="glossary-type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as FilterType)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="all">{t('all')}</option>
                  <option value="recommended">{t('typeRecommended')}</option>
                  <option value="forced">{t('typeForced')}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="glossary-status">{t('filterStatus')}</Label>
                <select
                  id="glossary-status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="all">{t('all')}</option>
                  <option value="enabled">{t('statusEnabled')}</option>
                  <option value="disabled">{t('statusDisabled')}</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <Label htmlFor="glossary-search">{t('search')}</Label>
                <div className="mt-1">
                  <Input
                    id="glossary-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canManage ? (
                <Button onClick={openCreate}>{t('create')}</Button>
              ) : null}
            </div>
          </div>

          {canManage ? (
            selectedCountInView > 0 ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {t('selectedCount', { count: selectedCountInView })}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSetStatus('enabled')}
                  >
                    {t('batchEnable')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => bulkSetStatus('disabled')}
                  >
                    {t('batchDisable')}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => requestDelete(filtered.filter((it) => selectedIds.has(it.id)).map((it) => it.id))}
                  >
                    {t('batchDelete')}
                  </Button>
                </div>
              </div>
            ) : null
          ) : (
            <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
              {t('readonlyHint')}
            </div>
          )}
        </CardHeader>

        <CardContent>
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : loading ? (
            <div className="space-y-3">
              <div className="h-4 w-1/3 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <div className="text-sm font-medium text-foreground">{t('emptyTitle')}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t('emptyDesc')}</div>
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">{t('exampleTitle')}</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">{t('colSource')}</div>
                    <div className="mt-1 font-medium text-foreground">entry</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('colTarget')}</div>
                    <div className="mt-1 font-medium text-foreground">条目</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('colType')}</div>
                    <div className="mt-1 font-medium text-foreground">{t('typeRecommended')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('colStatus')}</div>
                    <div className="mt-1 font-medium text-foreground">{t('statusEnabled')}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {t('exampleNote')}
                </div>
              </div>
              {canManage ? (
                <div className="mt-4">
                  <Button onClick={openCreate}>{t('create')}</Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="w-10 py-2 pr-2">
                      {canManage ? (
                        <input
                          aria-label={t('selectAll')}
                          type="checkbox"
                          checked={allChecked}
                          ref={(el) => {
                            if (el) el.indeterminate = isIndeterminate;
                          }}
                          onChange={(e) => toggleAllInView(e.target.checked)}
                          className="size-4 rounded border border-input bg-background align-middle accent-primary"
                        />
                      ) : null}
                    </th>
                    <th className="py-2 pr-4">{t('colSource')}</th>
                    <th className="py-2 pr-4">{t('colTarget')}</th>
                    <th className="py-2 pr-4 whitespace-nowrap">{t('colType')}</th>
                    <th className="py-2 pr-4 whitespace-nowrap">{t('colStatus')}</th>
                    <th className="py-2 pr-4">{t('colNote')}</th>
                    <th className="py-2 pr-4 whitespace-nowrap">{t('colUpdatedAt')}</th>
                    <th className="py-2 pr-0 whitespace-nowrap">{t('colOperations')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-border last:border-0 align-top"
                    >
                      <td className="py-3 pr-2">
                        {canManage ? (
                          <input
                            aria-label={t('selectOne')}
                            type="checkbox"
                            checked={selectedIds.has(it.id)}
                            onChange={(e) => toggleOne(it.id, e.target.checked)}
                            className="size-4 rounded border border-input bg-background align-middle accent-primary"
                          />
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 font-medium text-foreground">{it.source}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{it.target}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                            it.type === 'forced'
                              ? 'bg-warning/15 text-warning'
                              : 'bg-secondary text-secondary-foreground'
                          )}
                        >
                          {it.type === 'forced' ? t('typeForced') : t('typeRecommended')}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                            it.status === 'enabled'
                              ? 'bg-success/15 text-success'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {it.status === 'enabled' ? t('statusEnabled') : t('statusDisabled')}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {it.note ? (
                          <details className="group">
                            <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground">
                              <span className="line-clamp-2">{it.note}</span>
                              <span className="mt-1 inline-flex text-xs text-muted-foreground group-open:hidden">
                                {t('expand')}
                              </span>
                              <span className="mt-1 hidden text-xs text-muted-foreground group-open:inline-flex">
                                {t('collapse')}
                              </span>
                            </summary>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">{t('empty')}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                        <div>{formatUpdatedAt(it.updatedAt)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {t('updatedBy', { name: it.updatedBy })}
                        </div>
                      </td>
                      <td className="py-3 pr-0">
                        {canManage ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEdit(it.id)}
                            >
                              {t('edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleItemStatus(it.id)}
                            >
                              {it.status === 'enabled' ? t('disable') : t('enable')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => requestDelete([it.id])}
                            >
                              {t('delete')}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('empty')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setFormError('');
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingId ? t('editTitle') : t('createTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t('dialogDesc', { locale })}
            </DialogDescription>
          </DialogHeader>

          {formError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
              {(() => {
                const conflict = validateUniqueness(form.source);
                if (!conflict) return null;
                return (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditOpen(false);
                        window.setTimeout(() => openEdit(conflict.id), 0);
                      }}
                    >
                      {t('goToEditConflict')}
                    </Button>
                  </div>
                );
              })()}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="glossary-source">{t('formSource')}</Label>
              <div className="mt-1">
                <Input
                  id="glossary-source"
                  value={form.source}
                  onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
                  placeholder={t('formSourcePlaceholder')}
                  maxLength={200}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="glossary-target">{t('formTarget')}</Label>
              <div className="mt-1">
                <Input
                  id="glossary-target"
                  value={form.target}
                  onChange={(e) => setForm((prev) => ({ ...prev, target: e.target.value }))}
                  placeholder={t('formTargetPlaceholder')}
                  maxLength={200}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>{t('formType')}</Label>
              <RadioGroup
                value={form.type}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, type: value as GlossaryType }))
                }
                className="mt-2 space-y-2"
              >
                <Label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="recommended" />
                  <span className="text-foreground">{t('typeRecommended')}</span>
                  <span className="text-muted-foreground">{t('typeRecommendedHint')}</span>
                </Label>
                <Label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="forced" />
                  <span className="text-foreground">{t('typeForced')}</span>
                  <span className="text-muted-foreground">{t('typeForcedHint')}</span>
                </Label>
              </RadioGroup>
            </div>
            <div>
              <Label>{t('formStatus')}</Label>
              <RadioGroup
                value={form.status}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, status: value as GlossaryStatus }))
                }
                className="mt-2 space-y-2"
              >
                <Label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="enabled" />
                  <span className="text-foreground">{t('statusEnabled')}</span>
                </Label>
                <Label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="disabled" />
                  <span className="text-foreground">{t('statusDisabled')}</span>
                </Label>
              </RadioGroup>
            </div>
          </div>

          <div>
            <Label htmlFor="glossary-note">{t('formNote')}</Label>
            <div className="mt-1">
              <textarea
                id="glossary-note"
                value={form.note}
                onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder={t('formNotePlaceholder')}
                maxLength={500}
                className="min-h-[84px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {t('formNoteHelp')}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={saveItem}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base">{t('deleteTitle')}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t('deleteDesc', { count: deleteIds.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              {t('confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

