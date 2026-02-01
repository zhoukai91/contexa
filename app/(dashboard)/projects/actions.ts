'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { validatedActionWithUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { getTranslations } from 'next-intl/server';

const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'validations.projectNameRequired')
    .max(100, 'validations.projectNameMax'),
  description: z.string().max(2000, 'validations.projectDescMax').optional(),
  sourceLocale: z
    .string()
    .min(2, 'validations.sourceLocaleRequired')
    .max(20, 'validations.sourceLocaleMax'),
  translationAdapter: z
    .string()
    .min(1, 'validations.translationAdapterRequired')
    .max(50, 'validations.translationAdapterMax')
});

export const createProject = validatedActionWithUser(
  createProjectSchema,
  async (data, _, user) => {
    const t = await getTranslations('actions');

    if (!user.isSystemAdmin) {
      return {
        ...data,
        error: t('onlySystemAdminCreateProject')
      };
    }

    let created!: { id: number; sourceLocale: string };
    try {
      created = await prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            name: data.name,
            description: data.description?.trim()
              ? data.description.trim()
              : null,
            sourceLocale: data.sourceLocale,
            createdByUserId: user.id,
            translationAdapter: data.translationAdapter
          }
        });

        await tx.projectLocale.create({
          data: { projectId: created.id, locale: created.sourceLocale }
        });

        await tx.projectMember.create({
          data: {
            projectId: created.id,
            userId: user.id,
            role: 'admin',
            canReview: true
          }
        });

        return created;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return {
          ...data,
          error: t('createProjectNameExists')
        };
      }

      return {
        ...data,
        error: t('createProjectFailed')
      };
    }

    redirect(`/projects/${created.id}`);
  }
);
