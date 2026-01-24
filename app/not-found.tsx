import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/brand/logo-mark';

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-background">
      <div className="max-w-md space-y-8 p-4 text-center">
        <div className="flex justify-center">
          <LogoMark className="size-12 text-primary" />
        </div>
        <h1 className="text-4xl font-bold text-foreground tracking-tight">
          Page Not Found
        </h1>
        <p className="text-base text-muted-foreground">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>
        <Button asChild variant="outline" className="max-w-48 mx-auto w-full">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
