'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { PageTree, PageTreeNode } from '@/components/common/page-tree';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { WorkbenchTreeNode } from './actions';

interface WorkbenchSidebarProps {
  tree: WorkbenchTreeNode[];
  className?: string;
}

export function WorkbenchSidebar({ tree, className }: WorkbenchSidebarProps) {
  const t = useTranslations('projectWorkbench');
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPageId = searchParams.get('pageId');
  const currentModuleId = searchParams.get('moduleId');

  const currentId = currentModuleId
    ? `module-${currentModuleId}`
    : currentPageId
      ? `page-${currentPageId}`
      : undefined;

  const [query, setQuery] = React.useState('');

  const filteredTree = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    const hits = (s: string) => s.toLowerCase().includes(q);

    return tree
      .map((page) => {
        const pageHit = hits(page.label);
        const childHits = (page.children ?? []).filter((m) => hits(m.label));
        if (pageHit) return page;
        if (childHits.length === 0) return null;
        return { ...page, children: childHits };
      })
      .filter(Boolean) as WorkbenchTreeNode[];
  }, [tree, query]);

  const nodes: PageTreeNode[] = React.useMemo(() => {
    const mapNode = (node: WorkbenchTreeNode): PageTreeNode => ({
      id: node.id,
      label: (
        <div className="flex w-full items-center justify-between pr-2">
          <span className="truncate">{node.label}</span>
          {node.count > 0 ? (
            <Badge variant="secondary" className="ml-2 h-5 shrink-0 px-1.5 text-xs">
              {node.count}
            </Badge>
          ) : null}
        </div>
      ),
      children: node.children?.map(mapNode)
    });
    return filteredTree.map(mapNode);
  }, [filteredTree]);

  const defaultExpandedIds = React.useMemo(() => {
    const ids: string[] = [];
    if (currentModuleId) {
      const parentPage = tree.find((p) => p.children?.some((m) => m.id === `module-${currentModuleId}`));
      if (parentPage) ids.push(parentPage.id);
    }
    return ids;
  }, [tree, currentModuleId]);

  const handleSelect = (node: PageTreeNode) => {
    const [type, id] = node.id.split('-');

    const params = new URLSearchParams(searchParams.toString());
    if (type === 'page') {
      params.set('pageId', id);
      params.delete('moduleId');
    } else if (type === 'module') {
      params.set('moduleId', id);
      params.delete('pageId');
    }

    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  return (
    <div className={cn('border-r bg-background', className)}>
      <div className="border-b p-4">
        <h2 className="font-semibold">{t('tree.title')}</h2>
      </div>
      <div className="flex h-[calc(100%-3.5rem)] flex-col p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tree.searchPlaceholder')}
            className="h-9 pl-9"
          />
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {nodes.length === 0 ? (
            <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              {t('tree.emptySearch')}
            </div>
          ) : (
            <PageTree
              nodes={nodes}
          currentId={currentId}
          onSelect={handleSelect}
          defaultExpandedIds={defaultExpandedIds}
              className="space-y-1"
            />
          )}
        </div>
      </div>
    </div>
  );
}
