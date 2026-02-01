'use client';

import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { exportLanguagePackAction } from '../packages/actions';

export function DownloadLocaleButton({
  projectId,
  locale,
  mode = 'fallback',
  buttonProps
}: {
  projectId: number;
  locale: string;
  mode?: 'empty' | 'fallback' | 'filled';
  buttonProps?: Omit<ComponentProps<typeof Button>, 'onClick'>;
}) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await exportLanguagePackAction({ projectId, locale, mode });
      if (!res.ok) {
        push({ variant: 'destructive', title: '导出失败', message: res.error });
        return;
      }

      const blob = new Blob([res.data.content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      push({ variant: 'default', title: '已开始下载', message: `导出语言：${locale}` });
    } catch {
      push({ variant: 'destructive', title: '导出失败', message: '导出过程中发生异常，请重试。' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      {...buttonProps}
      disabled={busy || buttonProps?.disabled}
      onClick={handleClick}
    >
      <Download className="size-4" />
      下载
    </Button>
  );
}
