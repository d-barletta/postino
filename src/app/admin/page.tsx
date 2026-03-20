'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { StatsCards } from '@/components/admin/StatsCards';
import { AdminOverviewCharts } from '@/components/admin/AdminOverviewCharts';
import { Card, CardContent } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import AdminUsersPage from './users/page';
import AdminEmailsPage from './emails/page';
import AdminSettingsPage from './settings/page';
import type { Stats } from '@/types';

export default function AdminPage() {
  const { firebaseUser } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [firebaseUser]);

  const renderOverviewContent = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="glass-panel rounded-xl px-6 py-4 animate-pulse"
            >
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
          <StatsCards stats={stats} />
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
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

        <TabsContent value="settings">
          <AdminSettingsPage showPageHeader={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
