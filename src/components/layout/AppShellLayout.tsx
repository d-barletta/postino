'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { useI18n } from '@/lib/i18n';

type AppShellLayoutProps = {
  children: React.ReactNode;
  mode: 'dashboard' | 'admin';
};

export function AppShellLayout({ children, mode }: AppShellLayoutProps) {
  const router = useRouter();
  const { authUser, user, loading } = useAuth();
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const requiresAdmin = mode === 'admin';
  const checking = loading || Boolean(requiresAdmin && authUser && !user);

  useEffect(() => {
    if (!loading) {
      if (!authUser) {
        router.push('/login');
      } else if (requiresAdmin && user && !user.isAdmin) {
        router.push('/dashboard');
      }
    }
  }, [loading, authUser, requiresAdmin, user, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (checking) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#efd957] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!authUser) return null;

  const contextLink =
    mode === 'admin'
      ? { href: '/dashboard', label: t.nav.dashboard }
      : user?.isAdmin
        ? { href: '/admin', label: t.nav.admin }
        : null;

  return (
    <div className="min-h-[calc(100vh-70px)]">
      <nav className="glass-panel sticky top-0 z-10 border-0! dark:bg-transparent!">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link href="/" className="flex items-center gap-2">
              <PostinoLogo className="h-6 w-6" />
              <span className="font-bold text-gray-900">Postino</span>
            </Link>
            <nav className="flex items-center gap-1">
              {contextLink && (
                <Link
                  href={contextLink.href}
                  className="border ml-2 px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 rounded-lg transition-colors"
                >
                  {contextLink.label}
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                {authUser.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                {t.nav.signOut}
              </Button>
            </div>
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <i
                className={`bi ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'} text-lg`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/50 dark:border-white/10 px-4 py-3 space-y-2 ui-fade-up">
            <div className="px-3 pt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
              {authUser.email}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-700 dark:text-gray-200"
              onClick={async () => {
                setMobileMenuOpen(false);
                await handleSignOut();
              }}
            >
              {t.nav.signOut}
            </Button>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">{children}</main>
    </div>
  );
}
