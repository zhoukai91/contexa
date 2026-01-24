'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ActionState } from '@/lib/auth/middleware';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/form-error';
import { updateProjectBasicAction } from '../actions';

export function ProjectSettingsBasicForm({
  projectId,
  initialName,
  initialDescription,
  sourceLocale,
  canEdit
}: {
  projectId: number;
  initialName: string;
  initialDescription: string | null;
  sourceLocale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('projectSettingsBasic');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProjectBasicAction,
    { error: '' }
  );

  return (
    <form className="space-y-6" action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />

      <div>
        <Label htmlFor="name">{t('projectName')}</Label>
        <div className="mt-1">
          <Input
            id="name"
            name="name"
            type="text"
            defaultValue={state.name ?? initialName}
            required
            maxLength={100}
            disabled={!canEdit}
            className="h-10"
            placeholder={t('projectNamePlaceholder')}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">{t('projectDescription')}</Label>
        <div className="mt-1">
          <Input
            id="description"
            name="description"
            type="text"
            defaultValue={state.description ?? initialDescription ?? ''}
            maxLength={2000}
            disabled={!canEdit}
            className="h-10"
            placeholder={t('projectDescriptionPlaceholder')}
          />
        </div>
      </div>

      <div>
        <Label>{t('sourceLocale')}</Label>
        <div className="mt-1 text-sm text-foreground">{sourceLocale}</div>
      </div>

      <FormError message={state?.error} />

      <div>
        <Button type="submit" disabled={pending || !canEdit}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
