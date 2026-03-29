'use client';

import { useAuth } from '@/hooks/useAuth';
import { AssignedEmailCard } from '@/components/dashboard/AssignedEmailCard';
import { RulesManager } from '@/components/dashboard/RulesManager';
import { EmailLogsList } from '@/components/dashboard/EmailLogsList';
import { EmailSearchTab } from '@/components/dashboard/EmailSearchTab';
import { UserStatsCards } from '@/components/dashboard/UserStatsCards';
import { UserOverviewCharts } from '@/components/dashboard/UserOverviewCharts';
import { PushNotificationButton } from '@/components/dashboard/PushNotificationButton';
import { ForwardingHeaderCard } from '@/components/dashboard/ForwardingHeaderCard';
import { InstallPwaDrawer } from '@/components/dashboard/InstallPwaDrawer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailLog, UserStats } from '@/types';
import { useI18n } from '@/lib/i18n';
import { LayoutDashboard, ListFilter, Inbox, Search } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading, firebaseUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const [maxRuleLength, setMaxRuleLength] = useState(1000);
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'emails' | 'search'>('overview');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [emailListRefreshTrigger, setEmailListRefreshTrigger] = useState(0);
  const searchParams = useSearchParams();
  const editRuleId = searchParams.get('editRule');
  const selectedEmailId = searchParams.get('selectedEmail');

  useEffect(() => {
    if (selectedEmailId) {
      setActiveTab('emails');
    } else if (editRuleId) {
      setActiveTab('rules');
    }
  }, [selectedEmailId, editRuleId]);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => { if (d.maxRuleLength) setMaxRuleLength(d.maxRuleLength); })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/email/logs?pageSize=50', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
    }
  }, [firebaseUser]);

  const fetchStats = useCallback(async () => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/user/stats', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      if (data.stats) setUserStats(data.stats);
    }
  }, [firebaseUser]);

  useEffect(() => {
    setLogsLoading(true);
    if (!firebaseUser) { setLogsLoading(false); return; }
    const initialFetch = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const [logsRes, statsRes] = await Promise.all([
          fetch('/api/email/logs?pageSize=50', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/user/stats', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (logsRes.ok) {
          const data = await logsRes.json();
          setLogs(data.logs || []);
        }
        if (statsRes.ok) {
          const data = await statsRes.json();
          if (data.stats) setUserStats(data.stats);
        }
      } finally {
        setLogsLoading(false);
      }
    };
    initialFetch();
  }, [firebaseUser]);

  const handleLogsRefresh = useCallback(async () => {
    await Promise.all([fetchLogs(), fetchStats()]);
    setEmailListRefreshTrigger((n) => n + 1);
  }, [fetchLogs, fetchStats]);

  // Refresh email list when a push notification is clicked. The service worker
  // broadcasts an 'EMAIL_NOTIFICATION_CLICK' message via BroadcastChannel so that
  // any open dashboard window re-fetches without requiring a full page reload.
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window) || !firebaseUser) return;
    const channel = new BroadcastChannel('postino-refresh');
    const handleMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === 'EMAIL_NOTIFICATION_CLICK') {
        handleLogsRefresh();
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [firebaseUser, handleLogsRefresh]);

  const handleAddressToggle = useCallback(async (enabled: boolean) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    await fetch('/api/user/address-toggle', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAddressEnabled: enabled }),
    });
    await refreshUser();
  }, [firebaseUser, refreshUser]);

  const handleForwardingHeaderToggle = useCallback(async (enabled: boolean) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    await fetch('/api/user/forwarding-header-toggle', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isForwardingHeaderEnabled: enabled }),
    });
    await refreshUser();
  }, [firebaseUser, refreshUser]);

  if (loading || logsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100svh-8rem)]">
        <div className="animate-spin h-8 w-8 border-4 border-[#efd957] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 ui-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.dashboard.title}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t.dashboard.subtitle}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'rules' | 'emails' | 'search')}>
        <TabsList>
          <TabsTrigger value="overview">
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.overview}</span>
          </TabsTrigger>
          <TabsTrigger value="rules">
            <ListFilter className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.myRules}</span>
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Inbox className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.emailHistory}</span>
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.search}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="space-y-6">
            {user?.assignedEmail && (
              <AssignedEmailCard
                assignedEmail={user.assignedEmail}
                userEmail={user.email}
                isAddressEnabled={user.isAddressEnabled !== false}
                onToggle={handleAddressToggle}
              />
            )}
            <PushNotificationButton />
            <ForwardingHeaderCard
              isEnabled={user?.isForwardingHeaderEnabled !== false}
              onToggle={handleForwardingHeaderToggle}
            />
            {userStats && <UserStatsCards stats={userStats} />}
            {userStats && <UserOverviewCharts stats={userStats} logs={logs} />}
          </div>
        </TabsContent>
        <TabsContent value="rules">
          <RulesManager maxRuleLength={maxRuleLength} editRuleId={editRuleId ?? undefined} />
        </TabsContent>
        <TabsContent value="emails">
          <EmailLogsList
            key={selectedEmailId ?? 'email-list'}
            selectedEmailId={selectedEmailId ?? undefined}
            refreshTrigger={emailListRefreshTrigger}
          />
        </TabsContent>
        <TabsContent value="search">
          <EmailSearchTab />
        </TabsContent>
      </Tabs>
      <InstallPwaDrawer />
    </div>
  );
}

