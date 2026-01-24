'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, Languages, LayoutTemplate, Menu, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

type NavItem = {
  href: string;
  icon: typeof BookOpen;
  label: string;
};

function ProjectSidebarNav({
  navItems,
  onNavigate
}: {
  navItems: NavItem[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return navItems.map((item) => (
    <Link key={item.href} href={item.href} passHref>
      <Button
        variant={isActive(item.href) ? 'secondary' : 'ghost'}
        className="shadow-none my-0.5 h-9 w-full justify-start gap-2 px-3 text-sm"
        onClick={onNavigate}
      >
        <item.icon className="h-4 w-4" />
        {item.label}
      </Button>
    </Link>
  ));
}

export function ProjectSidebar({
  projectId,
  projectName
}: {
  projectId: number;
  projectName: string;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const t = useTranslations('projectNav');

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        href: `/projects/${projectId}/packages`,
        icon: Languages,
        label: t('packages')
      },
      {
        href: `/projects/${projectId}/glossary`,
        icon: BookOpen,
        label: t('glossary')
      },
      {
        href: `/projects/${projectId}/workbench`,
        icon: LayoutTemplate,
        label: t('workbench')
      },
      {
        href: `/projects/${projectId}/context`,
        icon: LayoutTemplate,
        label: t('context')
      },
      {
        href: `/projects/${projectId}/settings/basic`,
        icon: Settings,
        label: t('settings')
      }
    ],
    [projectId, t]
  );

  return (
    <>
      <div className="lg:hidden flex items-center justify-between bg-background border-b border-border px-4 py-3">
        <div className="flex items-center">
          <span className="text-sm font-medium">{t('mobileTitle', { projectName })}</span>
        </div>
        <Button
          className="-mr-3"
          variant="ghost"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <Menu className="h-6 w-6" />
          <span className="sr-only">{t('toggleSidebar')}</span>
        </Button>
      </div>

      <aside
        className={`w-64 shrink-0 bg-background border-r border-border lg:block ${
          isSidebarOpen ? 'block' : 'hidden'
        } lg:relative absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="h-full overflow-y-auto p-3">
          <div className="hidden lg:block px-3 py-2">
            <div className="truncate text-sm font-semibold text-foreground">
              {projectName}
            </div>
          </div>
          <Suspense fallback={null}>
            <ProjectSidebarNav
              navItems={navItems}
              onNavigate={() => setIsSidebarOpen(false)}
            />
          </Suspense>
        </nav>
      </aside>
    </>
  );
}
