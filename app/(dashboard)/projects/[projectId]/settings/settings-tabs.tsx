'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

type TabItem = { href: string; label: string };

export function ProjectSettingsTabs({ projectId }: { projectId: number }) {
  const pathname = usePathname();
  const t = useTranslations('projectSettingsTabs');

  const base = `/projects/${projectId}/settings`;
  const tabs: TabItem[] = [
    { href: `${base}/basic`, label: t('basic') },
    { href: `${base}/locales`, label: t('locales') },
    { href: `${base}/members`, label: t('members') },
    { href: `${base}/quality`, label: t('quality') },
    { href: `${base}/personalization`, label: t('personalization') }
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-1">
      {tabs.map((tab) => (
        <Button
          asChild
          key={tab.href}
          variant={isActive(tab.href) ? 'secondary' : 'ghost'}
          className="h-9 px-3 shadow-none"
        >
          <Link href={tab.href}>{tab.label}</Link>
        </Button>
      ))}
    </div>
  );
}
