import Link from 'next/link';
import { Settings, Download, Upload, FileDown, RefreshCcw, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, type TableColumn } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { getProjectOverviewQuery, listProjectOverviewRecentEntriesQuery } from './actions';
import { DownloadLocaleButton } from './download-locale-button';

function formatDateTime(iso: string) {
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

export default async function ProjectOverviewPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const id = Number(projectId);
  if (!Number.isFinite(id)) return null;

  const [overview, recentEntries] = await Promise.all([
    getProjectOverviewQuery(id),
    listProjectOverviewRecentEntriesQuery(id, { limit: 10 })
  ]);
  if (!overview) return null;

  const { project, stats, localeStats } = overview;

  const entryRows = recentEntries.map((row) => ({
    ...row,
    updatedAt: formatDateTime(row.updatedAt)
  }));

  const entryColumns: Array<TableColumn<(typeof entryRows)[number]>> = [
    {
      key: 'key',
      title: 'Key',
      headerClassName: 'text-xs text-muted-foreground',
      cellClassName: 'py-3 pr-4 text-sm text-foreground',
      render: (value: unknown) => (
        <span className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground">
          {String(value)}
        </span>
      )
    },
    {
      key: 'source',
      title: '源文案',
      headerClassName: 'text-xs text-muted-foreground',
      cellClassName: 'py-3 pr-4 text-sm text-foreground'
    },
    {
      key: 'status',
      title: '状态',
      headerClassName: 'text-xs text-muted-foreground',
      cellClassName: 'py-3 pr-4 text-sm',
      render: (value: unknown) => {
        const status = String(value);
        const tone =
          status === '已完成'
            ? 'text-success'
            : status === '待验收'
              ? 'text-warning'
              : 'text-destructive';

        return <span className={`text-xs font-medium ${tone}`}>{status}</span>;
      }
    },
    {
      key: 'updatedAt',
      title: '最近更新',
      headerClassName: 'text-xs text-muted-foreground text-right',
      cellClassName: 'py-3 text-right text-sm text-muted-foreground',
      align: 'right'
    }
  ];

  const reviewLink = `/projects/${id}/workbench?statuses=needs_review,ready,needs_update`;
  const missingLink = `/projects/${id}/workbench?statuses=pending`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="text-xs text-muted-foreground">
          <Link href="/projects" className="text-foreground">
            项目
          </Link>
          <span className="mx-2">/</span>
          <span>{project.name}</span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground lg:text-2xl">{project.name}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{project.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${id}/settings`}>
                <Settings className="size-4" />
                项目设置
              </Link>
            </Button>
            <Button asChild size="sm">
              <a href={`/api/projects/${id}/export-all?mode=fallback`}>
                <Download className="size-4" />
                导出全部语言包
              </a>
            </Button>
          </div>
        </div>
      </div>

      <Card
        title={<span className="text-base">项目进度概览</span>}
        description={<span className="text-sm">汇总全局进度、规模与待处理事项</span>}
        contentClassName="grid gap-3 lg:grid-cols-3"
      >
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="text-xs text-muted-foreground">总体完成度</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xl font-semibold text-foreground">{stats.globalProgress}%</div>
            <span className="text-xs text-muted-foreground">平均进度</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-secondary">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${stats.globalProgress}%` }}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="text-xs text-muted-foreground">翻译规模</div>
          <div className="mt-2 text-xl font-semibold text-foreground">{project.totalKeys}</div>
          <div className="mt-2 text-xs text-muted-foreground">源语言 · {project.sourceLocale}</div>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="text-xs text-muted-foreground">待处理事项</div>
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground">待验收</span>
              <Link href={reviewLink} className="text-warning hover:underline">
                {stats.pendingReview}
              </Link>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-foreground">待翻译</span>
              <Link href={missingLink} className="text-destructive hover:underline">
                {stats.missing}
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={<span className="text-base">快速操作</span>}
        description={<span className="text-sm">频繁录入与同步入口</span>}
        contentClassName="flex flex-wrap gap-3"
      >
        <Button asChild size="sm">
          <Link href={`/projects/${id}/packages?tab=import`}>
            <Upload className="size-4" />
            上传源文件
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/projects/${id}/packages?tab=import`}>
            <FileDown className="size-4" />
            导入译文
          </Link>
        </Button>
        <Button size="sm" variant="outline" disabled>
          <RefreshCcw className="size-4" />
          从代码仓同步（待接入）
        </Button>
      </Card>

      <Card
        title={<span className="text-base">目标语言状态</span>}
        description={<span className="text-sm">查看各语言进度与待处理量</span>}
        contentClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {localeStats.map((item) => {
          const statusLabel =
            item.progress >= 100 ? '可发布' : item.progress === 0 ? '未开始' : '进行中';
          const statusTone =
            item.progress >= 100
              ? 'text-success'
              : item.progress === 0
                ? 'text-destructive'
                : 'text-info';

          const workbenchStatuses =
            item.missingCount > 0
              ? 'pending,needs_update,needs_review'
              : item.reviewCount > 0
                ? 'needs_review,ready,needs_update'
                : 'approved';

          return (
            <div key={item.locale} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span>{item.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.locale}</div>
                </div>
                <span className={`rounded-full border border-border bg-card px-2 py-0.5 text-xs ${statusTone}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-secondary">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>已翻译 {item.translatedCount}</span>
                <span>待验收 {item.reviewCount}</span>
                <span>待翻译 {item.missingCount}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <DownloadLocaleButton projectId={id} locale={item.locale} />
                <Button asChild size="sm" variant={item.progress < 100 ? 'default' : 'outline'}>
                  <Link href={`/projects/${id}/workbench?locale=${encodeURIComponent(item.locale)}&statuses=${encodeURIComponent(workbenchStatuses)}`}>
                    {item.progress < 100 ? '翻译' : '验收'}
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <Card
        title={<span className="text-base">词条工作台</span>}
        description={<span className="text-sm">聚焦近期更新与待处理条目</span>}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={`/projects/${id}/workbench`}>
              查看全部词条
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        }
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-border bg-secondary px-3 py-1 text-sm text-foreground"
            >
              概览
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-1 text-sm text-muted-foreground"
            >
              全部词条
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-1 text-sm text-muted-foreground"
            >
              历史记录
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="搜索 Key / 文案" className="w-60" />
            <Button size="sm" variant="outline">
              筛选
            </Button>
          </div>
        </div>
        <Table
          columns={entryColumns}
          data={entryRows}
          rowKey={(row, index) => `${row.key}:${row.locale}:${index}`}
          className="rounded-lg border border-border"
        />
      </Card>
    </div>
  );
}
