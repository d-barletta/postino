'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/Button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { firebaseUser, user, loading } = useAuth();
  const [checking, setChecking] = useState(true);

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
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2 text-white">
              <span className="text-xl">✉️</span>
              <span className="font-bold">Postino Admin</span>
            </Link>
            <nav className="flex items-center gap-1">
              {[
                { href: '/admin', label: 'Overview' },
                { href: '/admin/users', label: 'Users' },
                { href: '/admin/settings', label: 'Settings' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white">
                Dashboard
              </Button>
            </Link>
            <Button variant="ghost" size="sm" className="text-gray-300 hover:text-white" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
