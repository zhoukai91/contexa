import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getLocale, getTranslations } from 'next-intl/server';

type ProjectListItem = {
  id: number;
  name: string;
  description: string | null;
  sourceLocale: string;
  createdAt: Date;
  _count: { entries: number };
};

export default async function DashboardProjectsPage() {
  const locale = await getLocale();
  const t = await getTranslations('dashboardProjects');
  const user = await requireUser();

  const projects: ProjectListItem[] = await prisma.project.findMany({
    where: user.isSystemAdmin
      ? undefined
      : {
          members: {
            some: { userId: user.id }
          }
        },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      sourceLocale: true,
      createdAt: true,
      _count: { select: { entries: true } }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.isSystemAdmin
              ? t('subtitleSystemAdmin')
              : t('subtitleMember')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user.isSystemAdmin ? (
            <Button asChild>
              <Link href="/projects/new">{t('createProject')}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {user.isSystemAdmin
                ? t('emptyTitleSystemAdmin')
                : t('emptyTitleMember')}
            </CardTitle>
            <CardDescription>
              {user.isSystemAdmin ? t('emptyDescSystemAdmin') : t('emptyDescMember')}
            </CardDescription>
            {user.isSystemAdmin ? (
              <CardAction>
                <Button asChild>
                  <Link href="/projects/new">{t('createProject')}</Link>
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4">{t('title')}</th>
                  <th className="py-2 pr-4">{t('sourceLocale')}</th>
                  <th className="py-2 pr-4 text-right">{t('entryCount')}</th>
                  <th className="py-2 pr-4">{t('createdAt')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${p.id}`}
                          className="block truncate font-medium text-foreground hover:underline"
                        >
                          {p.name}
                        </Link>
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {p.description || '—'}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {p.sourceLocale}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-right text-muted-foreground">
                      {p._count.entries}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString(locale, { hour12: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
