'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';

export function DashboardLink() {
  const { authUser, loading } = useAuth();
  const { t } = useI18n();

  if (loading || !authUser) return null;

  return (
    <div className="mt-4 text-center">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
        {t.auth.dashboardLink.alreadySignedIn}
      </p>
      <Link href="/dashboard">
        <Button variant="secondary" size="sm">
          {t.auth.dashboardLink.goToDashboard}
        </Button>
      </Link>
    </div>
  );
}
