'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { useI18n } from '@/lib/i18n';
import { signOut } from '@/lib/auth';

function getSafeRedirectPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/login';
  }

  return nextPath;
}

export default function LogoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const tl = t.auth.logout;
  const redirectPath = getSafeRedirectPath(searchParams.get('next'));

  useEffect(() => {
    let isActive = true;

    const performLogout = async () => {
      try {
        await signOut();
      } catch (error) {
        console.error('Failed to sign out:', error);
      } finally {
        if (isActive) {
          router.replace(redirectPath);
        }
      }
    };

    void performLogout();

    return () => {
      isActive = false;
    };
  }, [redirectPath, router]);

  return (
    <div className="flex-1 from-yellow-50 via-white to-amber-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md ui-fade-up">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="inline-flex flex-col items-center gap-0 mb-4 hover:opacity-80 transition-opacity"
          >
            <PostinoLogo className="h-12 w-12" />
            <span className="font-bold text-3xl text-gray-900 dark:text-white">Postino</span>
          </Link>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 text-center space-y-4">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#efd957] border-t-transparent" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tl.title}</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">{tl.subtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
