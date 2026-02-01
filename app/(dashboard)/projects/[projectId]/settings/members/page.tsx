import { getLocale } from 'next-intl/server';
import { prisma } from '@/lib/db/prisma';
import { ProjectSettingsMembersPageClient } from './members-page-client';

export default async function ProjectSettingsMembersPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const locale = await getLocale();
  const { projectId } = await params;
  const id = Number(projectId);
  if (!Number.isFinite(id)) return null;

  const [members, invitations, users] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        role: true,
        canReview: true,
        createdAt: true,
        user: { select: { account: true, name: true } }
      }
    }),
    prisma.projectInvitation.findMany({
      where: { projectId: id },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.findMany({
      where: { isSystemAdmin: false, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, account: true, name: true }
    })
  ] as const);

  return (
    <ProjectSettingsMembersPageClient
      projectId={id}
      members={members.map((m) => ({
        userId: m.userId,
        account: m.user.account,
        name: m.user.name,
        role: m.role,
        canReview: m.canReview,
        createdAt: new Date(m.createdAt).toLocaleString(locale, { hour12: false })
      }))}
      invitations={invitations.map((inv) => ({
        id: inv.id,
        account: inv.account,
        role: inv.role,
        canReview: inv.canReview,
        status: inv.status,
        createdAt: new Date(inv.createdAt).toLocaleString(locale, { hour12: false })
      }))}
      allUsers={users.map((u) => ({ id: u.id, account: u.account, name: u.name }))}
    />
  );
}
