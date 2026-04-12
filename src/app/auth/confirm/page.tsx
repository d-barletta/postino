import Link from 'next/link';
import { Suspense } from 'react';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { AuthConfirmHandler } from '@/components/auth/AuthConfirmHandler';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function AuthConfirmPage() {
  return (
    <div className="min-h-screen from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center ui-fade-up">
        <Link
          href="/"
          className="inline-flex flex-col items-center gap-0 mb-8 hover:opacity-80 transition-opacity"
        >
          <PostinoLogo className="h-12 w-12" />
          <span className="font-bold text-3xl text-gray-900 dark:text-white">Postino</span>
        </Link>
        <Suspense
          fallback={
            <p className="text-sm text-gray-600 dark:text-gray-400">Processing your request…</p>
          }
        >
          <AuthConfirmHandler />
        </Suspense>
      </div>
    </div>
  );
}
