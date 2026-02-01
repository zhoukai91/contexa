'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TranslationStatus } from '@prisma/client';
import { ChevronDown, Search } from 'lucide-react';
import { TargetLocaleSelect } from '@/components/target-locale-select';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface WorkbenchFiltersProps {
  targetLocales: string[];
  currentLocale: string;
  currentScopeLabel: React.ReactNode;
}

export function WorkbenchFilters({
  targetLocales,
  currentLocale,
  currentScopeLabel
}: WorkbenchFiltersProps) {
  const t = useTranslations('projectWorkbench');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(searchParams.get('search') || '');
  const debouncedQuery = useDebounce(query, 500);

  const currentStatuses = React.useMemo(() => {
    const s = searchParams.get('statuses');
    return s ? (s.split(',') as TranslationStatus[]) : [];
  }, [searchParams]);

  React.useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    if (debouncedQuery !== urlSearch) {
      const params = new URLSearchParams(searchParams.toString());
      if (debouncedQuery) {
        params.set('search', debouncedQuery);
      } else {
        params.delete('search');
      }
      params.set('page', '1');
      router.push(`?${params.toString()}`);
    }
  }, [debouncedQuery, router, searchParams]);

  const handleLocaleChange = (locale: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('locale', locale);
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handleStatusChange = (status: TranslationStatus, checked: boolean) => {
    const params = new URLSearchParams(searchParams.toString());
    let newStatuses = [...currentStatuses];

    if (checked) {
      if (!newStatuses.includes(status)) newStatuses.push(status);
    } else {
      newStatuses = newStatuses.filter((s) => s !== status);
    }

    if (newStatuses.length > 0) {
      params.set('statuses', newStatuses.join(','));
    } else {
      params.delete('statuses');
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const allStatuses: { value: TranslationStatus; label: string }[] = [
    { value: 'pending', label: t('status.pending') },
    { value: 'needs_update', label: t('status.needs_update') },
    { value: 'needs_review', label: t('status.needs_review') },
    { value: 'ready', label: t('status.ready') },
    { value: 'approved', label: t('status.approved') }
  ];

  return (
    <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('filters.targetLocale')}：</span>
          <TargetLocaleSelect
            targetLocales={targetLocales}
            value={currentLocale}
            onValueChange={handleLocaleChange}
            placeholder={t('filters.targetLocaleEmpty')}
            className="h-9 min-w-[220px]"
          />
        </div>

        <div className="hidden h-5 w-px bg-border lg:block" />

        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted-foreground">{t('filters.scope')}：</span>
          {currentScopeLabel}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="h-9 pl-9"
          />
        </div>

        <DropdownMenu
          trigger={
            <Button variant="outline" className="h-9">
              {t('filters.status')}
              <ChevronDown className="ml-2 size-4 text-muted-foreground" />
            </Button>
          }
          contentProps={{ align: 'end', className: 'min-w-[220px]' }}
          items={[
            { type: 'label', label: t('filters.status') },
            { type: 'separator' },
            ...allStatuses.map((s) => ({
              type: 'checkbox' as const,
              checked: currentStatuses.includes(s.value),
              onCheckedChange: (checked: boolean) => handleStatusChange(s.value, checked),
              label: s.label
            }))
          ]}
        />
      </div>
    </div>
  );
}
