'use server';

import { z } from 'zod';
import { ActivityType } from '@/lib/db/types';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { getTranslations } from 'next-intl/server';

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  await prisma.activityLog.create({
    data: {
      teamId,
      userId,
      action: type,
      ipAddress: ipAddress || null
    }
  });
}

const accountPattern = /^[A-Za-z0-9_.@-]+$/;
const accountSchema = z
  .string()
  .max(255, 'validations.accountMax')
  .regex(accountPattern, 'validations.accountPattern')
  .refine((v) => v === 'admin' || v.length >= 3, {
    message: 'validations.accountMin'
  });
const passwordSchema = z
  .string()
  .min(6, 'validations.passwordMin')
  .max(100, 'validations.passwordMax');

const signInSchema = z.object({
  account: accountSchema,
  password: passwordSchema
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { account, password } = data;
  const t = await getTranslations('actions');

  const foundUser = await prisma.user.findUnique({
    where: { account },
    include: {
      teamMembers: {
        take: 1,
        include: { team: true }
      }
    }
  });

  if (!foundUser) {
    return {
      error: t('signInFailed'),
      account,
      password
    };
  }

  const foundTeam = foundUser.teamMembers[0]?.team ?? null;

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      error: t('signInFailed'),
      account,
      password
    };
  }

  const rememberMe = formData.get('rememberMe') === 'on';

  await Promise.all([
    setSession({ id: foundUser.id }, { rememberMe }),
    logActivity(foundTeam?.id, foundUser.id, ActivityType.SIGN_IN)
  ]);

  const redirectTo = formData.get('redirect') as string | null;

  if (
    redirectTo &&
    redirectTo !== '/' &&
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('/sign-')
  ) {
    redirect(redirectTo);
  }

  const projects = await prisma.project.findMany({
    where: foundUser.isSystemAdmin
      ? undefined
      : {
          members: {
            some: { userId: foundUser.id }
          }
        },
    select: { id: true },
    take: 2,
    orderBy: { createdAt: 'desc' }
  });

  if (projects.length === 1) {
    redirect(`/projects/${projects[0].id}`);
  }

  redirect('/dashboard');
});

const signUpSchema = z.object({
  account: accountSchema,
  password: passwordSchema,
  inviteId: z.string().optional()
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { account, password, inviteId } = data;

  const existingUser = await prisma.user.findUnique({ where: { account } });
  if (existingUser) {
    return {
      error: '账号已存在或创建失败，请重试。',
      account,
      password
    };
  }

  const passwordHash = await hashPassword(password);

  const createdUser = await prisma.user.create({
    data: {
      account,
      passwordHash,
      role: 'owner'
    }
  });

  let teamId: number;
  let userRole: string;

  if (inviteId) {
    const invitationId = Number(inviteId);
    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, account, status: 'pending' }
    });

    if (!invitation) {
      return { error: 'Invalid or expired invitation.', account, password };
    }

    teamId = invitation.teamId;
    userRole = invitation.role;

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' }
    });

    await logActivity(teamId, createdUser.id, ActivityType.ACCEPT_INVITATION);
  } else {
    const createdTeam = await prisma.team.create({
      data: { name: `${account}'s Team` }
    });
    teamId = createdTeam.id;
    userRole = 'owner';

    await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM);
  }

  await Promise.all([
    prisma.teamMember.create({
      data: {
        userId: createdUser.id,
        teamId,
        role: userRole
      }
    }),
    logActivity(teamId, createdUser.id, ActivityType.SIGN_UP),
    setSession(createdUser)
  ]);

  const redirectTo = formData.get('redirect') as string | null;

  if (
    redirectTo &&
    redirectTo !== '/' &&
    redirectTo.startsWith('/') &&
    !redirectTo.startsWith('/sign-')
  ) {
    redirect(redirectTo);
  }

  const projects = await prisma.project.findMany({
    where: createdUser.isSystemAdmin
      ? undefined
      : {
          members: {
            some: { userId: createdUser.id }
          }
        },
    select: { id: true },
    take: 2,
    orderBy: { createdAt: 'desc' }
  });

  if (projects.length === 1) {
    redirect(`/projects/${projects[0].id}`);
  }

  redirect('/dashboard');
});

export async function signOut() {
  const user = await getUser();
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  }
  (await cookies()).delete('session');
}

const updatePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  confirmPassword: passwordSchema
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Current password is incorrect.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password must be different from the current password.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'New password and confirmation password do not match.'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash }
      }),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)
    ]);

    return {
      success: 'Password updated successfully.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: passwordSchema
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'Incorrect password. Account deletion failed.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    await prisma.user.update({
      where: { id: user.id },
      data: {
        deletedAt: new Date(),
        account: `${user.account}-${user.id}-deleted`
      }
    });

    await prisma.teamMember.deleteMany({
      where: { userId: user.id }
    });

    (await cookies()).delete('session');
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  account: accountSchema
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, account } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { name, account } }),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.coerce.number()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    await prisma.teamMember.deleteMany({
      where: { id: memberId, teamId: userWithTeam.teamId }
    });

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER
    );

    return { success: 'Team member removed successfully' };
  }
);

const inviteTeamMemberSchema = z.object({
  account: accountSchema,
  role: z.enum(['member', 'owner'])
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { account, role } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'User is not part of a team' };
    }

    const existingMember = await prisma.user.findFirst({
      where: {
        account,
        teamMembers: {
          some: { teamId: userWithTeam.teamId }
        }
      }
    });
    if (existingMember) {
      return { error: 'User is already a member of this team' };
    }

    const existingInvitation = await prisma.invitation.findFirst({
      where: { account, teamId: userWithTeam.teamId, status: 'pending' }
    });
    if (existingInvitation) {
      return { error: 'An invitation has already been sent to this account' };
    }

    await prisma.invitation.create({
      data: {
        teamId: userWithTeam.teamId,
        account,
        role,
        invitedBy: user.id,
        status: 'pending'
      }
    });

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.INVITE_TEAM_MEMBER
    );

    // TODO: Send invitation notification and include ?inviteId={id} to sign-up URL

    return { success: 'Invitation sent successfully' };
  }
);
