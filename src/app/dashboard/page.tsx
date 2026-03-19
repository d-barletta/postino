'use client';

import { useAuth } from '@/hooks/useAuth';
import { AssignedEmailCard } from '@/components/dashboard/AssignedEmailCard';
import { RulesManager } from '@/components/dashboard/RulesManager';
import { EmailLogsList } from '@/components/dashboard/EmailLogsList';
import { UserStatsCards } from '@/components/dashboard/UserStatsCards';
import { UserOverviewCharts } from '@/components/dashboard/UserOverviewCharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailLog, UserStats } from '@/types';

export default function DashboardPage() {
  const { user, loading, firebaseUser } = useAuth();
  const [maxRuleLength, setMaxRuleLength] = useState(1000);
  const [activeTab, setActiveTab] = useState<'rules' | 'emails'>('rules');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsRefreshing, setLogsRefreshing] = useState(false);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const searchParams = useSearchParams();
  const editRuleId = searchParams.get('editRule');

  useEffect(() => {
    if (editRuleId) {
      setActiveTab('rules');
    }
  }, [editRuleId]);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((d) => { if (d.maxRuleLength) setMaxRuleLength(d.maxRuleLength); })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!firebaseUser) return;
    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/email/logs', { headers: { Authorization: `Bearer ${token}` } });
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
          fetch('/api/email/logs', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/user/stats', { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (logsRes.ok) {
          const data = await logsRes.json();
          const fetchedLogs: EmailLog[] = data.logs || [];
          setLogs(fetchedLogs);
          if (fetchedLogs.length > 0 && !editRuleId) {
            setActiveTab('emails');
          }
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
    setLogsRefreshing(true);
    try { await Promise.all([fetchLogs(), fetchStats()]); }
    finally { setLogsRefreshing(false); }
  }, [fetchLogs, fetchStats]);

  if (loading || logsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[#EFD957] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 ui-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your Postino address and email rules</p>
      </div>

      {user?.assignedEmail && <AssignedEmailCard assignedEmail={user.assignedEmail} />}
      {userStats && <UserStatsCards stats={userStats} />}
      {userStats && <UserOverviewCharts stats={userStats} logs={logs} />}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'rules' | 'emails')}>
        <TabsList>
          <TabsTrigger value="rules">My Rules</TabsTrigger>
          <TabsTrigger value="emails">Email History</TabsTrigger>
        </TabsList>
        <TabsContent value="rules">
          <RulesManager maxRuleLength={maxRuleLength} editRuleId={editRuleId ?? undefined} />
        </TabsContent>
        <TabsContent value="emails">
          <EmailLogsList logs={logs} onRefresh={handleLogsRefresh} refreshing={logsRefreshing} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
