import { getTranslations } from 'next-intl/server';
import { LogoMark } from '@/components/brand/logo-mark';

export default async function UnsupportedDevicePage() {
  const t = await getTranslations('unsupportedDevice');
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="flex items-center justify-center">
          <LogoMark className="h-8 w-8 text-primary" />
          <span className="ml-2 text-2xl font-semibold text-foreground">
            Contexa TMS
          </span>
        </div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
        <p className="text-muted-foreground">{t('hint')}</p>
      </div>
    </div>
  );
}
