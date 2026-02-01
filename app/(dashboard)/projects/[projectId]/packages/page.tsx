import { ProjectPackagesClient } from './project-packages-client';
import { getPackagesBootstrapQuery, listPackagesEntriesQuery } from './actions';

export default async function ProjectPackagesPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const id = Number(projectId);
  if (!Number.isFinite(id)) return null;

  const sp = (await searchParams) ?? {};
  const requestedTab = typeof sp.tab === 'string' ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : '';
  const initialTab =
    requestedTab === 'import' || requestedTab === 'history' || requestedTab === 'entries'
      ? requestedTab
      : undefined;

  const [bootstrap, entries] = await Promise.all([
    getPackagesBootstrapQuery(id),
    listPackagesEntriesQuery(id)
  ]);

  return (
    <ProjectPackagesClient
        projectId={id}
        sourceLocale={bootstrap.ok ? bootstrap.data.sourceLocale : ''}
        targetLocales={bootstrap.ok ? bootstrap.data.targetLocales : []}
        templateShape={bootstrap.ok ? bootstrap.data.templateShape : 'flat'}
        canManage={bootstrap.ok ? bootstrap.data.canManage : false}
        initialEntries={entries.ok ? entries.data.items : []}
        initialTab={initialTab}
        bootstrapError={bootstrap.ok ? '' : bootstrap.error}
        entriesError={entries.ok ? '' : entries.error}
      />
  );
}
