'use client';

import { useAuth } from '@/hooks/useAuth';
import { AssignedEmailCard } from '@/components/dashboard/AssignedEmailCard';
import { RulesManager } from '@/components/dashboard/RulesManager';
import { EmailLogsList } from '@/components/dashboard/EmailLogsList';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { EmailLog } from '@/types';

export default function DashboardPage() {
  const { user, loading, firebaseUser } = useAuth();
  const [maxRuleLength, setMaxRuleLength] = useState(1000);
  const [activeTab, setActiveTab] = useState<'rules' | 'emails'>('rules');
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
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
      .then((d) => {
        if (d.maxRuleLength) setMaxRuleLength(d.maxRuleLength);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLogsLoading(true);
    if (!firebaseUser) {
      setLogsLoading(false);
      return;
    }
    const fetchLogs = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch('/api/email/logs', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const fetchedLogs: EmailLog[] = data.logs || [];
          setLogs(fetchedLogs);
          if (fetchedLogs.length > 0 && !editRuleId) {
            setActiveTab('emails');
          }
        }
      } finally {
        setLogsLoading(false);
      }
    };
    fetchLogs();
  }, [firebaseUser]);

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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your Postino address and email rules</p>
      </div>

      {user?.assignedEmail && (
        <AssignedEmailCard assignedEmail={user.assignedEmail} />
      )}

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          {(['rules', 'emails'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#EFD957] text-[#a3891f] dark:text-[#f3df79]'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'rules' ? 'My Rules' : 'Email History'}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'rules' ? (
        <RulesManager maxRuleLength={maxRuleLength} editRuleId={editRuleId ?? undefined} />
      ) : (
        <EmailLogsList logs={logs} />
      )}
    </div>
  );
}
