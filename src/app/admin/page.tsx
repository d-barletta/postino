'use client';

import { useState, useEffect, useTransition } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { StatsCards } from '@/components/admin/StatsCards';
import { AdminOverviewCharts } from '@/components/admin/AdminOverviewCharts';
import { Card, CardContent } from '@/components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import AdminUsersPage from './users/page';
import AdminEmailsPage from './emails/page';
import AdminSettingsPage from './settings/page';
import EmailJobsLiveTab from '@/components/admin/EmailJobsLiveTab';
import type { Stats } from '@/types';
import { Home, Users, Mail, Activity, Settings } from 'lucide-react';

export default function AdminPage() {
  const { firebaseUser } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [, startTransition] = useTransition();

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

  const handleTabChange = (value: string) => {
    startTransition(() => {
      setActiveTab(value);
    });
  };

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
      </Tabs>
    </div>
  );
}
