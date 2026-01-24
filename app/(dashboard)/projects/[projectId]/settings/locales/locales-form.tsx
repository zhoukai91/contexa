'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ActionState } from '@/lib/auth/middleware';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/form-error';
import { addProjectLocalesAction } from '../actions';

export function ProjectSettingsLocalesForm({
  projectId,
  canEdit
}: {
  projectId: number;
  canEdit: boolean;
}) {
  const t = useTranslations('projectSettingsLocales');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addProjectLocalesAction,
    { error: '' }
  );

  return (
    <form className="space-y-4" action={formAction}>
      <input type="hidden" name="projectId" value={projectId} />
      <div>
        <Label htmlFor="localesText">{t('addLabel')}</Label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            id="localesText"
            name="localesText"
            type="text"
            defaultValue={state.localesText ?? ''}
            disabled={!canEdit}
            maxLength={500}
            className="h-10"
            placeholder={t('addPlaceholder')}
          />
          <Button type="submit" disabled={pending || !canEdit}>
            {pending ? t('adding') : t('add')}
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t('addHelp')}</p>
      </div>

      <FormError message={state?.error} />
    </form>
  );
}
