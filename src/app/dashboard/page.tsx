'use client';

import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { AssignedEmailCard } from '@/components/dashboard/AssignedEmailCard';
import { RulesManager } from '@/components/dashboard/RulesManager';
import { EmailSearchTab } from '@/components/dashboard/EmailSearchTab';
import { KnowledgeTab } from '@/components/dashboard/KnowledgeTab';
import { RelationsTab } from '@/components/dashboard/RelationsTab';
import { AgentTab } from '@/components/dashboard/AgentTab';
import { UserStatsCards, type StatsPeriod } from '@/components/dashboard/UserStatsCards';
import { UserOverviewCharts } from '@/components/dashboard/UserOverviewCharts';
import { PushNotificationButton } from '@/components/dashboard/PushNotificationButton';
import { ForwardingHeaderCard } from '@/components/dashboard/ForwardingHeaderCard';
import { AnalysisLanguageCard } from '@/components/dashboard/AnalysisLanguageCard';
import { InstallPwaDrawer } from '@/components/dashboard/InstallPwaDrawer';
import { DeleteEntitiesCard } from '@/components/dashboard/DeleteEntitiesCard';
import { ResetUsageStatsCard } from '@/components/dashboard/ResetUsageStatsCard';
import { ClearMemoriesCard } from '@/components/dashboard/ClearMemoriesCard';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailLog, UserStats } from '@/types';
import { useI18n } from '@/lib/i18n';
import {
  Home,
  ListFilter,
  Inbox,
  Settings,
  Download,
  CheckCircle,
  Compass,
  Share2,
  Bot,
} from 'lucide-react';

const EMPTY_STATS: UserStats = {
  totalEmailsReceived: 0,
  totalEmailsForwarded: 0,
  totalEmailsError: 0,
  totalEmailsSkipped: 0,
  totalTokensUsed: 0,
  totalEstimatedCost: 0,
};

const DASHBOARD_TABS = [
  'overview',
  'rules',
  'inbox',
  'agent',
  'explore',
  'relations',
  'settings',
] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

function DashboardOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-6 animate-pulse">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-4 w-72 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="h-10 w-28 rounded-lg bg-gray-200 dark:bg-gray-700" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-4 animate-pulse">
              <div className="mb-2 h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-6 w-12 rounded bg-gray-200 dark:bg-gray-700" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="px-6 py-4 animate-pulse">
          <div className="mb-6 h-4 w-36 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="flex h-48 items-end gap-1.5 pb-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-gray-200 dark:bg-gray-700"
                style={{ height: `${25 + ((i * 19) % 65)}%` }}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardPanelSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-5 animate-pulse">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="h-4 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
              <div className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading, firebaseUser, refreshUser } = useAuth();
  const { t } = useI18n();
  const [maxRuleLength, setMaxRuleLength] = useState(1000);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [emailListRefreshTrigger, setEmailListRefreshTrigger] = useState(0);
  const [installPwaTrigger, setInstallPwaTrigger] = useState(0);
  const [isPwa, setIsPwa] = useState(false);
  const [canShowInstallCard, setCanShowInstallCard] = useState(false);
  const searchParams = useSearchParams();
  const editRuleId = searchParams.get('editRule');
  const selectedEmailId = searchParams.get('selectedEmail');

  // ---------------------------------------------------------------------------
  // Tab history: push a history entry when the user clicks a tab so the
  // browser Back button can navigate between previously-visited tabs.
  // ---------------------------------------------------------------------------

  // On mount, restore the tab stored in the current history entry (survives
  // page refreshes).  Falls back to the tab saved in localStorage (survives
  // browser restarts).  If no valid tab is found anywhere, stamp the entry
  // with the default 'overview' so that popstate always has a value to read.
  useEffect(() => {
    const historyTab = (window.history.state as Record<string, unknown> | null)?.postinoTab as
      | DashboardTab
      | undefined;
    const localTab = localStorage.getItem('postinoActiveTab') as DashboardTab | null;
    const savedTab =
      historyTab && (DASHBOARD_TABS as ReadonlyArray<string>).includes(historyTab)
        ? historyTab
        : localTab && (DASHBOARD_TABS as ReadonlyArray<string>).includes(localTab)
          ? localTab
          : null;
    if (savedTab) {
      setActiveTab(savedTab);
      window.history.replaceState({ ...(window.history.state ?? {}), postinoTab: savedTab }, '');
    } else {
      window.history.replaceState({ ...(window.history.state ?? {}), postinoTab: 'overview' }, '');
    }
  }, []);

  // Listen for browser Back/Forward and restore the tab stored in the state.
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if ((e.state as Record<string, unknown> | null)?.postinoTab !== undefined) {
        setActiveTab((e.state as { postinoTab: DashboardTab }).postinoTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigate to a tab and record the change in browser history and localStorage.
  const handleTabChange = useCallback((newTab: string) => {
    localStorage.setItem('postinoActiveTab', newTab);
    window.history.pushState({ postinoTab: newTab as DashboardTab }, '');
    setActiveTab(newTab as DashboardTab);
  }, []);

  useEffect(() => {
    if (selectedEmailId) {
      // Update history state to reflect the URL-forced tab so that Back works
      // correctly if the user later opens a modal from this tab.
      window.history.replaceState({ ...(window.history.state ?? {}), postinoTab: 'inbox' }, '');
      setActiveTab('inbox');
    } else if (editRuleId) {
      window.history.replaceState({ ...(window.history.state ?? {}), postinoTab: 'rules' }, '');
      setActiveTab('rules');
    }
  }, [selectedEmailId, editRuleId]);

  useEffect(() => {
    setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const isAndroid = /android/i.test(ua);
    const isIOSFirefox = isIOS && /fxios/i.test(ua);

    if ((isIOS || isAndroid) && !isIOSFirefox) {
      setCanShowInstallCard(true);
      return;
    }

    // Desktop: only show the card if the browser supports the native install prompt.
    const handler = () => setCanShowInstallCard(true);
    window.addEventListener('beforeinstallprompt', handler, { once: true });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => {
        if (d.maxRuleLength) setMaxRuleLength(d.maxRuleLength);
        setMemoryEnabled(d.memoryEnabled === true);
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/email/logs?pageSize=50', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
    } else {
      toast.error(t.dashboard.emailHistory.failedToLoad);
    }
  }, [firebaseUser]);

  const fetchStats = useCallback(async (period: StatsPeriod = statsPeriod) => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const url = period === 'all' ? '/api/user/stats' : `/api/user/stats?period=${period}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      if (data.stats) setUserStats(data.stats);
    } else {
      toast.error(t.dashboard.toasts.failedToLoadStats);
    }
  }, [firebaseUser, statsPeriod]);

  useEffect(() => {
    if (!firebaseUser) {
      setLogsLoading(false);
      return;
    }
    setLogsLoading(true);
    // Use 'all' on initial load; period changes are handled by handleStatsPeriodChange.
    Promise.all([fetchLogs(), fetchStats('all')]).finally(() => setLogsLoading(false));
  }, [firebaseUser]); // fetchLogs and fetchStats are derived from firebaseUser — no separate dep needed

  // Re-fetch stats when period changes.
  const handleStatsPeriodChange = useCallback(
    (period: StatsPeriod) => {
      setStatsPeriod(period);
      fetchStats(period);
    },
    [fetchStats],
  );

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

  const handleAddressToggle = useCallback(
    async (enabled: boolean) => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/user/address-toggle', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAddressEnabled: enabled }),
        });
        if (!res.ok) throw new Error();
        await refreshUser();
        toast.success(t.dashboard.toasts.settingSaved);
      } catch {
        toast.error(t.dashboard.toasts.failedToUpdateEmailSetting);
      }
    },
    [firebaseUser, refreshUser],
  );

  const handleAiAnalysisOnlyToggle = useCallback(
    async (enabled: boolean) => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/user/ai-analysis-toggle', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAiAnalysisOnlyEnabled: enabled }),
        });
        if (!res.ok) throw new Error();
        await refreshUser();
        toast.success(t.dashboard.toasts.settingSaved);
      } catch {
        toast.error(t.dashboard.toasts.failedToUpdateAiAnalysisOnlySetting);
      }
    },
    [firebaseUser, refreshUser],
  );

  const handleForwardingHeaderToggle = useCallback(
    async (enabled: boolean) => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/user/forwarding-header-toggle', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isForwardingHeaderEnabled: enabled }),
        });
        if (!res.ok) throw new Error();
        await refreshUser();
        toast.success(t.dashboard.toasts.settingSaved);
      } catch {
        toast.error(t.dashboard.toasts.failedToUpdateForwardingHeaderSetting);
      }
    },
    [firebaseUser, refreshUser],
  );

  const handleAnalysisLanguageChange = useCallback(
    async (language: string | null) => {
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/user/analysis-language', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisOutputLanguage: language }),
        });
        if (!res.ok) throw new Error();
        await refreshUser();
        toast.success(t.dashboard.toasts.settingSaved);
      } catch {
        toast.error(t.dashboard.toasts.failedToUpdateAnalysisLanguageSetting);
      }
    },
    [firebaseUser, refreshUser],
  );

  const renderOverviewContent = () => {
    if (loading || logsLoading) {
      return <DashboardOverviewSkeleton />;
    }

    return (
      <div className="space-y-6">
        {user?.assignedEmail && (
          <AssignedEmailCard
            assignedEmail={user.assignedEmail}
            userEmail={user.email}
            isAddressEnabled={user.isAddressEnabled !== false}
            onToggle={handleAddressToggle}
            isAiAnalysisOnlyEnabled={user.isAiAnalysisOnlyEnabled === true}
            onAiAnalysisOnlyToggle={handleAiAnalysisOnlyToggle}
          />
        )}
        {memoryEnabled && (userStats?.totalEmailsReceived ?? 0) > 0 && (
          <Card className="">
            <CardContent className="flex flex-col items-start gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#efd957]/40 dark:bg-white">
                  <PostinoLogo className="h-5 w-5" title={t.dashboard.agent.cta.title} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {t.dashboard.agent.cta.title}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.dashboard.agent.cta.description}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => handleTabChange('agent')}
                className="shrink-0 bg-[#efd957] text-[#171717] hover:bg-[#d6c043]"
              >
                {t.dashboard.agent.cta.button}
              </Button>
            </CardContent>
          </Card>
        )}
        <UserStatsCards stats={userStats ?? EMPTY_STATS} period={statsPeriod} onPeriodChange={handleStatsPeriodChange} />
        <UserOverviewCharts stats={userStats ?? EMPTY_STATS} logs={logs} />
      </div>
    );
  };

  const renderSettingsContent = () => {
    if (loading) {
      return <DashboardPanelSkeleton cards={6} />;
    }

    return (
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
        <ResetUsageStatsCard onSuccess={handleLogsRefresh} />
        <ClearMemoriesCard />
        <DeleteEntitiesCard />
        {(isPwa || canShowInstallCard) && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t.dashboard.installApp.title}
              </h2>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <div
                  className="w-16 h-16 rounded-2xl shadow-md overflow-hidden flex items-center justify-center p-2.5 shrink-0 bg-white dark:bg-white"
                  style={{ backgroundColor: '#ffffff' }}
                >
                  <PostinoLogo className="h-11 w-11" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {t.dashboard.installApp.description}
                  </p>
                  <div className="flex justify-end">
                    <Button onClick={() => setInstallPwaTrigger((n) => n + 1)} disabled={isPwa}>
                      {isPwa ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      {isPwa
                        ? t.dashboard.installApp.alreadyInstalled
                        : t.dashboard.installApp.buttonLabel}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 ui-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.dashboard.title}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t.dashboard.subtitle}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
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
          {memoryEnabled && (
            <TabsTrigger value="agent">
              <Bot className="h-4 w-4 shrink-0" />
              <span>{t.dashboard.tabs.agent}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="explore">
            <Compass className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.explore}</span>
          </TabsTrigger>
          <TabsTrigger value="relations">
            <Share2 className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.relations}</span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.settings}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{renderOverviewContent()}</TabsContent>
        <TabsContent value="rules">
          {loading ? (
            <DashboardPanelSkeleton />
          ) : (
            <RulesManager maxRuleLength={maxRuleLength} editRuleId={editRuleId ?? undefined} />
          )}
        </TabsContent>
        <TabsContent value="inbox">
          {loading ? (
            <DashboardPanelSkeleton />
          ) : (
            <EmailSearchTab
              key={selectedEmailId ?? 'inbox'}
              selectedEmailId={selectedEmailId ?? undefined}
              refreshTrigger={emailListRefreshTrigger}
            />
          )}
        </TabsContent>
        {memoryEnabled && (
          <TabsContent value="agent">
            {loading ? <DashboardPanelSkeleton cards={2} /> : <AgentTab />}
          </TabsContent>
        )}
        <TabsContent value="explore">
          {loading ? <DashboardPanelSkeleton /> : <KnowledgeTab />}
        </TabsContent>
        <TabsContent value="relations">
          {loading ? <DashboardPanelSkeleton /> : <RelationsTab />}
        </TabsContent>
        <TabsContent value="settings">{renderSettingsContent()}</TabsContent>
      </Tabs>
      <InstallPwaDrawer forceOpenTrigger={installPwaTrigger} />
    </div>
  );
}
