'use client';

import { toast } from 'sonner';
import { useState, useEffect, useTransition, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { StatsCards, type StatsPeriod } from '@/components/admin/StatsCards';
import { AdminOverviewCharts } from '@/components/admin/AdminOverviewCharts';
import { Card, CardContent } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import AdminUsersPage from './users/page';
import AdminEmailsPage from './emails/page';
import AdminSettingsPage from './settings/page';
import EmailJobsLiveTab from '@/components/admin/EmailJobsLiveTab';
import AdminBlogTab from '@/components/admin/AdminBlogTab';
import type { Stats } from '@/types';
import { Home, Users, Mail, Activity, Settings, BookOpen } from 'lucide-react';

type AdminTab = 'overview' | 'users' | 'emails' | 'jobs' | 'blog' | 'settings';
const ADMIN_TABS: ReadonlyArray<AdminTab> = [
  'overview',
  'users',
  'emails',
  'jobs',
  'blog',
  'settings',
];

export default function AdminPage() {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [, startTransition] = useTransition();

  const fetchAdminStats = useCallback(
    async (period: StatsPeriod = statsPeriod) => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const url =
          period === 'all' ? '/api/admin/stats' : `/api/admin/stats?period=${period}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        } else {
          toast.error(t.admin.toasts.failedToLoadStats);
        }
      } finally {
        setLoading(false);
      }
    },
    [firebaseUser, statsPeriod],
  );

  useEffect(() => {
    // Use 'all' on initial load; period changes are handled by handleStatsPeriodChange.
    fetchAdminStats('all');
  }, [firebaseUser]); // fetchAdminStats is derived from firebaseUser — no separate dep needed

  const handleStatsPeriodChange = useCallback(
    (period: StatsPeriod) => {
      setStatsPeriod(period);
      setLoading(true);
      fetchAdminStats(period);
    },
    [fetchAdminStats],
  );

  // ---------------------------------------------------------------------------
  // Tab history: push a history entry when the user clicks a tab so the
  // browser Back button can navigate between previously-visited tabs.
  // ---------------------------------------------------------------------------

  // On mount, restore the tab stored in the current history entry (survives
  // page refreshes).  Falls back to the tab saved in localStorage (survives
  // browser restarts).  If no valid tab is found anywhere, stamp the entry
  // with the default 'overview' so that popstate always has a value to read.
  useEffect(() => {
    const historyTab = (window.history.state as Record<string, unknown> | null)?.postinoAdminTab as
      | AdminTab
      | undefined;
    const localTab = localStorage.getItem('postinoAdminActiveTab') as AdminTab | null;
    const savedTab =
      historyTab && (ADMIN_TABS as ReadonlyArray<string>).includes(historyTab)
        ? historyTab
        : localTab && (ADMIN_TABS as ReadonlyArray<string>).includes(localTab)
          ? localTab
          : null;
    if (savedTab) {
      setActiveTab(savedTab);
      window.history.replaceState(
        { ...(window.history.state ?? {}), postinoAdminTab: savedTab },
        '',
      );
    } else {
      window.history.replaceState(
        { ...(window.history.state ?? {}), postinoAdminTab: 'overview' },
        '',
      );
    }
  }, []);

  // Listen for browser Back/Forward and restore the tab stored in the state.
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const tab = (e.state as Record<string, unknown> | null)?.postinoAdminTab;
      if (typeof tab === 'string' && (ADMIN_TABS as ReadonlyArray<string>).includes(tab)) {
        setActiveTab(tab as AdminTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate to a tab and record the change in browser history and localStorage.
  const handleTabChange = useCallback(
    (value: string) => {
      if (!(ADMIN_TABS as ReadonlyArray<string>).includes(value)) return;
      const newTab = value as AdminTab;
      localStorage.setItem('postinoAdminActiveTab', newTab);
      window.history.pushState({ postinoAdminTab: newTab }, '');
      startTransition(() => {
        setActiveTab(newTab);
      });
    },
    [startTransition],
  );

  const renderOverviewContent = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="glass-panel rounded-xl px-6 py-4 animate-pulse">
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
              <div className="h-7 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            </div>
          ))}
        </div>
      );
    }

    if (stats) {
      return (
        <>
          <StatsCards stats={stats} period={statsPeriod} onPeriodChange={handleStatsPeriodChange} />
          <AdminOverviewCharts stats={stats} />
        </>
      );
    }

    return (
      <Card>
        <CardContent>
          <p className="text-gray-500 dark:text-gray-400">Failed to load statistics.</p>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 ui-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Overview</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Platform statistics and management</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">
            <Home className="h-4 w-4 shrink-0" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 shrink-0" />
            <span>Users</span>
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Mail className="h-4 w-4 shrink-0" />
            <span>Emails</span>
          </TabsTrigger>
          <TabsTrigger value="jobs">
            <Activity className="h-4 w-4 shrink-0" />
            <span>Jobs</span>
          </TabsTrigger>
          <TabsTrigger value="blog">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>Blog</span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">{renderOverviewContent()}</div>
        </TabsContent>

        <TabsContent value="users">
          <AdminUsersPage showPageHeader={false} />
        </TabsContent>

        <TabsContent value="emails">
          <AdminEmailsPage showPageHeader={false} />
        </TabsContent>

        <TabsContent value="jobs">
          <EmailJobsLiveTab />
        </TabsContent>

        <TabsContent value="settings">
          <AdminSettingsPage showPageHeader={false} />
        </TabsContent>

        <TabsContent value="blog">
          <AdminBlogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
