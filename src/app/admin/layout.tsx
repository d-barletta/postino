'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { PostinoLogo } from '@/components/brand/PostinoLogo';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firebaseUser, user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!firebaseUser) {
        router.push('/login');
      } else if (user && !user.isAdmin) {
        router.push('/dashboard');
      } else if (user) {
        setChecking(false);
      }
    }
  }, [loading, firebaseUser, user, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-[#EFD957] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="glass-panel sticky top-0 z-10 border-b border-white/40 dark:border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 text-gray-900 dark:text-white">
              <PostinoLogo className="h-6 w-6" />
              <span className="font-bold">Postino Admin</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {[
                { href: '/admin', label: 'Overview' },
                { href: '/admin/users', label: 'Users' },
                { href: '/admin/settings', label: 'Settings' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 rounded-lg transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                Dashboard
              </Button>
            </Link>
            <Button variant="ghost" size="sm" className="hidden md:inline-flex text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white" onClick={handleSignOut}>
              Sign out
            </Button>
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
            {[
              { href: '/admin', label: 'Overview' },
              { href: '/admin/users', label: 'Users' },
              { href: '/admin/settings', label: 'Settings' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20"
              >
                {item.label}
              </Link>
            ))}
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
