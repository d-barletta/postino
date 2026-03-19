'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { PostinoLogo } from '@/components/brand/PostinoLogo';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firebaseUser, user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) {
      router.push('/login');
    }
  }, [loading, firebaseUser, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#EFD957] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!firebaseUser) return null;

  return (
    <div className="min-h-screen">
      <nav className="glass-panel sticky top-0 z-10 border-b border-white/40 dark:border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <PostinoLogo className="h-6 w-6" />
              <span className="font-bold text-gray-900">Postino</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/dashboard" className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 rounded-lg transition-colors">
                Dashboard
              </Link>
              {user?.isAdmin && (
                <Link href="/admin" className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 rounded-lg transition-colors">
                  Admin
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user?.isAdmin && (
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                  Admin
                </Button>
              </Link>
            )}
            <div className="hidden md:flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                {firebaseUser.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-white/50 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <i className={`bi ${mobileMenuOpen ? 'bi-x-lg' : 'bi-list'} text-lg`} aria-hidden="true" />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/50 dark:border-white/10 px-4 py-3 space-y-2 ui-fade-up">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20"
            >
              Dashboard
            </Link>
            {user?.isAdmin && (
              <Link
                href="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20"
              >
                Admin
              </Link>
            )}
            <div className="px-3 pt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{firebaseUser.email}</div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-gray-700 dark:text-gray-200"
              onClick={async () => {
                setMobileMenuOpen(false);
                await handleSignOut();
              }}
            >
              Sign out
            </Button>
          </div>
        )}
      </nav>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
