'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { signIn, signUp } from './actions';
import { ActionState } from '@/lib/auth/middleware';
import { FormError } from '@/components/form-error';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/brand/logo-mark';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const t = useTranslations('login');
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const priceId = searchParams.get('priceId');
  const inviteId = searchParams.get('inviteId');
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-end pb-4">
          <LanguageSwitcher />
        </div>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center justify-center gap-2">
              <LogoMark className="h-8 w-8 text-primary" />
              <span className="text-lg font-semibold">Contexa</span>
            </div>
            <CardTitle className="text-center text-2xl">
              {mode === 'signin' ? t('titleSignIn') : t('titleSignUp')}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <form className="space-y-4" action={formAction}>
              <input type="hidden" name="redirect" value={redirect || ''} />
              <input type="hidden" name="priceId" value={priceId || ''} />
              <input type="hidden" name="inviteId" value={inviteId || ''} />

              <div className="space-y-2">
                <Label htmlFor="email">{t('accountLabel')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="text"
                  autoComplete="username"
                  defaultValue={state.email}
                  required
                  minLength={mode === 'signin' ? 5 : 6}
                  maxLength={50}
                  pattern="[A-Za-z0-9.@]+"
                  placeholder={t('accountPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('passwordLabel')}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={
                    mode === 'signin' ? 'current-password' : 'new-password'
                  }
                  defaultValue={state.password}
                  required
                  minLength={6}
                  maxLength={100}
                  pattern="[A-Za-z0-9.@]+"
                  placeholder={t('passwordPlaceholder')}
                />
                {mode === 'signin' ? (
                  <p className="text-sm text-muted-foreground">
                    {t('forgotPasswordHint')}
                  </p>
                ) : null}
              </div>

              <FormError message={state?.error} />

              <Button type="submit" className="w-full" size="lg" disabled={pending}>
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    {t('submitLoading')}
                  </>
                ) : mode === 'signin' ? (
                  t('submitSignIn')
                ) : (
                  t('submitSignUp')
                )}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-2 text-muted-foreground">
                  {mode === 'signin'
                    ? t('switchPromptSignIn')
                    : t('switchPromptSignUp')}
                </span>
              </div>
            </div>

            <Button asChild variant="outline" className="w-full" size="lg">
              <Link
                href={`${mode === 'signin' ? '/sign-up' : '/sign-in'}${
                  redirect ? `?redirect=${redirect}` : ''
                }${priceId ? `&priceId=${priceId}` : ''}`}
              >
                {mode === 'signin' ? t('switchToSignUp') : t('switchToSignIn')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
