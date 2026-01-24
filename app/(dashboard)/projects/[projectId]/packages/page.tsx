import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db/prisma';

export default async function ProjectPackagesPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations('projectPackages');
  const { projectId } = await params;
  const id = Number(projectId);
  if (!Number.isFinite(id)) return null;

  const project = await prisma.project.findUnique({
    where: { id },
    select: { sourceLocale: true }
  });
  if (!project) return null;

  const locales = await prisma.projectLocale.findMany({
    where: { projectId: id },
    select: { locale: true }
  });

  const targetLocales = locales
    .map((l) => l.locale)
    .filter((locale) => locale !== project.sourceLocale);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground lg:text-2xl">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      {targetLocales.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('emptyTargetLocalesTitle')}</CardTitle>
            <CardDescription>{t('emptyTargetLocalesDesc')}</CardDescription>
            <CardAction>
              <Button asChild>
                <Link href={`/projects/${id}/settings/locales`}>{t('goToSettings')}</Link>
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('placeholderTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('placeholderDesc')}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
