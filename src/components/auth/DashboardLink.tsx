'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function DashboardLink() {
  const { firebaseUser, loading } = useAuth();

  if (loading || !firebaseUser) return null;

  return (
    <div className="mt-4 text-center">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">You are already signed in.</p>
      <Link href="/dashboard">
        <Button variant="secondary" size="sm">Go to Dashboard</Button>
      </Link>
    </div>
  );
}
