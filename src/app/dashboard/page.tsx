'use client';

import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { AssignedEmailCard } from '@/components/dashboard/AssignedEmailCard';
import { MonthlyCreditsCard } from '@/components/dashboard/MonthlyCreditsCard';
import { RulesManager } from '@/components/dashboard/RulesManager';
import { EmailSearchTab } from '@/components/dashboard/EmailSearchTab';
import { KnowledgeTab, type KnowledgeData } from '@/components/dashboard/KnowledgeTab';
import { RelationsTab } from '@/components/dashboard/RelationsTab';
import { AgentTab } from '@/components/dashboard/AgentTab';
import { UserStatsCards, type StatsPeriod } from '@/components/dashboard/UserStatsCards';
import { UserOverviewCharts } from '@/components/dashboard/UserOverviewCharts';
import { PushNotificationButton } from '@/components/dashboard/PushNotificationButton';
import { ForwardingHeaderCard } from '@/components/dashboard/ForwardingHeaderCard';
import { AnalysisLanguageCard } from '@/components/dashboard/AnalysisLanguageCard';
import { InstallPwaDrawer } from '@/components/dashboard/InstallPwaDrawer';
import { DeleteEntitiesCard } from '@/components/dashboard/DeleteEntitiesCard';
import { ClearAnalysisCard } from '@/components/dashboard/ClearAnalysisCard';
import { ResetUsageStatsCard } from '@/components/dashboard/ResetUsageStatsCard';
import { ClearMemoriesCard } from '@/components/dashboard/ClearMemoriesCard';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useState, useEffect, useCallback, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailLog, UserStats } from '@/types';
import { useI18n } from '@/lib/i18n';
import { useGlobalModals } from '@/lib/modals';
import {
  Home,
  ListFilter,
  Inbox,
  Settings,
  Download,
  CheckCircle,
  Compass,
  Share2,
  ChevronRight,
  Brain,
} from 'lucide-react';

const EMPTY_STATS: UserStats = {
  totalEmailsReceived: 0,
  totalEmailsForwarded: 0,
  totalEmailsError: 0,
  totalEmailsSkipped: 0,
  totalTokensUsed: 0,
  totalEstimatedCost: 0,
  totalCreditsUsed: 0,
  monthlyCreditsUsed: 0,
  monthlyCreditsLimit: 0,
  monthlyCreditsRemaining: 0,
};

type DashboardTab = 'overview' | 'rules' | 'inbox' | 'agent' | 'explore' | 'relations' | 'settings';

const DASHBOARD_TABS: ReadonlyArray<DashboardTab> = [
  'overview',
  'rules',
  'inbox',
  'agent',
  'explore',
  'relations',
  'settings',
];

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
  const { user, loading, authUser, refreshUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const { openAgentFullPage } = useGlobalModals();
  const [maxRuleLength, setMaxRuleLength] = useState(1000);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [hasVisitedRelations, setHasVisitedRelations] = useState(false);
  const [, startTransition] = useTransition();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [knowledgeData, setKnowledgeData] = useState<KnowledgeData | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [emailListRefreshTrigger, setEmailListRefreshTrigger] = useState(0);
  const [installPwaTrigger, setInstallPwaTrigger] = useState(0);
  const [isPwa, setIsPwa] = useState(false);
  const [canShowInstallCard, setCanShowInstallCard] = useState(false);
  const searchParams = useSearchParams();
  const editRuleId = searchParams.get('editRule');
  const selectedEmailId = searchParams.get('selectedEmail');

  // Navigate to a tab and record the change in browser history and localStorage.
  const handleTabChange = useCallback(
    (newTab: string) => {
      if (!(DASHBOARD_TABS as ReadonlyArray<string>).includes(newTab)) return;
      const tab = newTab as DashboardTab;
      localStorage.setItem('postinoDashboardActiveTab', tab);
      window.history.pushState({ postinoDashboardTab: tab }, '');
      startTransition(() => {
        setActiveTab(tab);
      });
    },
    [startTransition],
  );

  useEffect(() => {
    if (selectedEmailId) {
      setActiveTab('inbox');
    } else if (editRuleId) {
      setActiveTab('rules');
      const url = new URL(window.location.href);
      if (url.searchParams.has('editRule')) {
        url.searchParams.set('editRule', '');
        window.history.replaceState(window.history.state, '', url);
      }
    }
  }, [selectedEmailId, editRuleId]);

  // On mount, restore the tab from the current history entry (survives
  // page refreshes) or from localStorage (survives browser restarts).
  // Search-param overrides take priority and are handled by the effect above.
  useEffect(() => {
    if (selectedEmailId || editRuleId) return;
    const historyTab = (window.history.state as Record<string, unknown> | null)
      ?.postinoDashboardTab as DashboardTab | undefined;
    const localTab = localStorage.getItem('postinoDashboardActiveTab') as DashboardTab | null;
    const savedTab =
      historyTab && (DASHBOARD_TABS as ReadonlyArray<string>).includes(historyTab)
        ? historyTab
        : localTab && (DASHBOARD_TABS as ReadonlyArray<string>).includes(localTab)
          ? localTab
          : null;
    if (savedTab) {
      setActiveTab(savedTab);
      window.history.replaceState(
        { ...(window.history.state ?? {}), postinoDashboardTab: savedTab },
        '',
      );
    } else {
      window.history.replaceState(
        { ...(window.history.state ?? {}), postinoDashboardTab: 'overview' },
        '',
      );
    }
  }, []);

  // Listen for browser Back/Forward and restore the tab stored in the state.
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const tab = (e.state as Record<string, unknown> | null)?.postinoDashboardTab;
      if (typeof tab === 'string' && (DASHBOARD_TABS as ReadonlyArray<string>).includes(tab)) {
        setActiveTab(tab as DashboardTab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    setIsPwa(window.matchMedia('(display-mode: standalone)').matches);
  }, []);

  useEffect(() => {
    if (activeTab === 'relations') {
      setHasVisitedRelations(true);
    }
  }, [activeTab]);

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
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!authUser) return;
    const token = await getIdToken();
    const res = await fetch('/api/email/logs?pageSize=50', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs || []);
    } else {
      toast.error(t.dashboard.emailHistory.failedToLoad);
    }
  }, [authUser]);

  const fetchStats = useCallback(
    async (period: StatsPeriod = statsPeriod) => {
      if (!authUser) return;
      const token = await getIdToken();
      const url = period === 'all' ? '/api/user/stats' : `/api/user/stats?period=${period}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setUserStats(data.stats);
      } else {
        toast.error(t.dashboard.toasts.failedToLoadStats);
      }
    },
    [authUser, statsPeriod],
  );

  const fetchKnowledge = useCallback(async () => {
    if (!authUser) return;
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/email/knowledge', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as KnowledgeData;
      setKnowledgeData(json);
    } catch {
      toast.error(t.dashboard.knowledge.failedToLoad);
      setKnowledgeError('Failed to load knowledge data');
    } finally {
      setKnowledgeLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setLogsLoading(false);
      return;
    }
    setLogsLoading(true);
    // Use 'all' on initial load; period changes are handled by handleStatsPeriodChange.
    Promise.all([fetchLogs(), fetchStats('all'), fetchKnowledge()]).finally(() =>
      setLogsLoading(false),
    );
  }, [authUser]); // fetchLogs, fetchStats, fetchKnowledge are derived from authUser — no separate dep needed

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

  const handleAnalysisClear = useCallback(async () => {
    await Promise.all([fetchLogs(), fetchStats(), fetchKnowledge()]);
    setEmailListRefreshTrigger((n) => n + 1);
  }, [fetchLogs, fetchStats, fetchKnowledge]);

  const handleEntitiesDelete = useCallback(async () => {
    await fetchKnowledge();
  }, [fetchKnowledge]);

  // Refresh email list when a push notification is clicked. The service worker
  // broadcasts an 'EMAIL_NOTIFICATION_CLICK' message via BroadcastChannel so that
  // any open dashboard window re-fetches without requiring a full page reload.
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window) || !authUser) return;
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
  }, [authUser, handleLogsRefresh]);

  const handleAddressToggle = useCallback(
    async (enabled: boolean) => {
      if (!authUser) return;
      try {
        const token = await getIdToken();
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
    [authUser, refreshUser],
  );

  const handleAiAnalysisOnlyToggle = useCallback(
    async (enabled: boolean) => {
      if (!authUser) return;
      try {
        const token = await getIdToken();
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
    [authUser, refreshUser],
  );

  const handleForwardingHeaderToggle = useCallback(
    async (enabled: boolean) => {
      if (!authUser) return;
      try {
        const token = await getIdToken();
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
    [authUser, refreshUser],
  );

  const handleAnalysisLanguageChange = useCallback(
    async (language: string | null) => {
      if (!authUser) return;
      try {
        const token = await getIdToken();
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
    [authUser, refreshUser],
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
        <MonthlyCreditsCard stats={userStats ?? EMPTY_STATS} onRefresh={fetchStats} />
        {(userStats?.totalEmailsReceived ?? 0) > 0 && (
          <Card
            className="group cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-[#efd957]"
            role="button"
            tabIndex={0}
            onClick={openAgentFullPage}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAgentFullPage();
              }
            }}
            aria-label={t.dashboard.agent.cta.button}
          >
            <CardContent className="flex items-center justify-between gap-4 py-6">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#efd957]/40 dark:bg-white">
                  <PostinoLogo className="h-5 w-5" title={t.dashboard.agent.cta.title} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {t.dashboard.agent.cta.title}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t.dashboard.agent.cta.description}
                  </p>
                </div>
              </div>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5 dark:text-gray-500"
                aria-hidden="true"
              />
            </CardContent>
          </Card>
        )}
        <UserStatsCards
          stats={userStats ?? EMPTY_STATS}
          period={statsPeriod}
          onPeriodChange={handleStatsPeriodChange}
        />
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
        {(isPwa || canShowInstallCard) && (
          <Card>
            <CardHeader heading={t.dashboard.installApp.title} />
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
        <PushNotificationButton />
        <ForwardingHeaderCard
          isEnabled={user?.isForwardingHeaderEnabled !== false}
          onToggle={handleForwardingHeaderToggle}
        />
        <AnalysisLanguageCard
          currentLanguage={user?.analysisOutputLanguage}
          onSave={handleAnalysisLanguageChange}
        />
        <ClearMemoriesCard />
        <ClearAnalysisCard onSuccess={handleAnalysisClear} />
        <DeleteEntitiesCard onSuccess={handleEntitiesDelete} />
        {user?.isAdmin && <ResetUsageStatsCard onSuccess={handleLogsRefresh} />}
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
          <TabsTrigger value="agent">
            <Brain className="h-4 w-4 shrink-0" />
            <span>{t.dashboard.tabs.agent}</span>
          </TabsTrigger>
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
      </Tabs>

      <div className="mt-6">
        {activeTab === 'overview' && renderOverviewContent()}

        {activeTab === 'rules' &&
          (loading ? (
            <DashboardPanelSkeleton />
          ) : (
            <RulesManager maxRuleLength={maxRuleLength} editRuleId={editRuleId ?? undefined} />
          ))}

        {activeTab === 'inbox' &&
          (loading ? (
            <DashboardPanelSkeleton />
          ) : (
            <EmailSearchTab
              key={selectedEmailId ?? 'inbox'}
              selectedEmailId={selectedEmailId ?? undefined}
              refreshTrigger={emailListRefreshTrigger}
              knowledgeData={knowledgeData}
              onCreditsUsed={fetchStats}
            />
          ))}

        {activeTab === 'agent' &&
          (loading || settingsLoading ? (
            <DashboardPanelSkeleton cards={2} />
          ) : (
            <AgentTab onCreditsUsed={fetchStats} />
          ))}

        {activeTab === 'explore' &&
          (loading ? (
            <DashboardPanelSkeleton />
          ) : (
            <KnowledgeTab
              knowledgeData={knowledgeData}
              knowledgeLoading={knowledgeLoading}
              knowledgeError={knowledgeError}
              onRefreshKnowledge={fetchKnowledge}
            />
          ))}

        {(activeTab === 'relations' || hasVisitedRelations) && (
          <div className={activeTab === 'relations' ? 'block' : 'hidden'}>
            {loading ? <DashboardPanelSkeleton /> : <RelationsTab />}
          </div>
        )}

        {activeTab === 'settings' && renderSettingsContent()}
      </div>

      <InstallPwaDrawer forceOpenTrigger={installPwaTrigger} />
    </div>
  );
}
