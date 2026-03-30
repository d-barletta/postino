'use client';

import { useAuth } from '@/hooks/useAuth';
import { AssignedEmailCard } from '@/components/dashboard/AssignedEmailCard';
import { RulesManager } from '@/components/dashboard/RulesManager';
import { EmailSearchTab } from '@/components/dashboard/EmailSearchTab';
import { UserStatsCards } from '@/components/dashboard/UserStatsCards';
import { UserOverviewCharts } from '@/components/dashboard/UserOverviewCharts';
import { PushNotificationButton } from '@/components/dashboard/PushNotificationButton';
import { ForwardingHeaderCard } from '@/components/dashboard/ForwardingHeaderCard';
import { AnalysisLanguageCard } from '@/components/dashboard/AnalysisLanguageCard';
import { InstallPwaDrawer } from '@/components/dashboard/InstallPwaDrawer';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailLog, UserStats } from '@/types';
import { useI18n } from '@/lib/i18n';
import { Home, ListFilter, Inbox, Settings, Download, CheckCircle } from 'lucide-react';

export default function DashboardPage() {
  const { user, loading, firebaseUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const [maxRuleLength, setMaxRuleLength] = useState(1000);
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'inbox' | 'settings'>('overview');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [emailListRefreshTrigger, setEmailListRefreshTrigger] = useState(0);
  const [installPwaTrigger, setInstallPwaTrigger] = useState(0);
  const [isPwa, setIsPwa] = useState(false);
  const searchParams = useSearchParams();
  const editRuleId = searchParams.get('editRule');
  const selectedEmailId = searchParams.get('selectedEmail');

  useEffect(() => {
    if (selectedEmailId) {
      setActiveTab('inbox');
    } else if (editRuleId) {
      setActiveTab('rules');
    }
  }, [selectedEmailId, editRuleId]);

  useEffect(() => {
    setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

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

  const handleAnalysisLanguageChange = useCallback(async (language: string | null) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    await fetch('/api/user/analysis-language', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisOutputLanguage: language }),
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'rules' | 'inbox' | 'settings')}>
        <TabsList>
          <TabsTrigger value="overview">
            <Home className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.overview}</span>
          </TabsTrigger>
          <TabsTrigger value="rules">
            <ListFilter className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.myRules}</span>
          </TabsTrigger>
          <TabsTrigger value="inbox">
            <Inbox className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.inbox}</span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.settings}</span>
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
            {userStats && <UserStatsCards stats={userStats} />}
            {userStats && <UserOverviewCharts stats={userStats} logs={logs} />}
          </div>
        </TabsContent>
        <TabsContent value="rules">
          <RulesManager maxRuleLength={maxRuleLength} editRuleId={editRuleId ?? undefined} />
        </TabsContent>
        <TabsContent value="inbox">
          <EmailSearchTab
            key={selectedEmailId ?? 'inbox'}
            selectedEmailId={selectedEmailId ?? undefined}
            refreshTrigger={emailListRefreshTrigger}
          />
        </TabsContent>
        <TabsContent value="settings">
          <div className="space-y-6">
            <PushNotificationButton />
            <ForwardingHeaderCard
              isEnabled={user?.isForwardingHeaderEnabled !== false}
              onToggle={handleForwardingHeaderToggle}
            />
            <AnalysisLanguageCard
              currentLanguage={user?.analysisOutputLanguage}
              onSave={handleAnalysisLanguageChange}
            />
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t.dashboard.installApp.title}
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-2xl shadow-md overflow-hidden flex items-center justify-center p-2.5 shrink-0 bg-white dark:bg-white">
                    <PostinoLogo className="h-11 w-11" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                      {t.dashboard.installApp.description}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        onClick={() => setInstallPwaTrigger((n) => n + 1)}
                        disabled={isPwa}
                      >
                        {isPwa ? <CheckCircle className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                        {isPwa ? t.dashboard.installApp.alreadyInstalled : t.dashboard.installApp.buttonLabel}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <InstallPwaDrawer forceOpenTrigger={installPwaTrigger} />
    </div>
  );
}

