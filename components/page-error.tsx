'use client';

import { Button } from '@/components/ui/button';

export function PageError({
  title,
  message,
  onRetry
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {title || 'Something went wrong'}
        </h2>
        {message ? (
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        ) : null}
        {onRetry ? (
          <div className="mt-4">
            <Button onClick={onRetry}>Retry</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
