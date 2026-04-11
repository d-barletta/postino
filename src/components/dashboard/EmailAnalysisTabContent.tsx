'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { EmailAnalysisPanel } from '@/components/dashboard/EmailAnalysisPanel';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import type { EmailAnalysis } from '@/types';

interface EmailAnalysisTabContentProps {
  emailId: string;
  analysis?: EmailAnalysis | null;
  onAnalysisUpdated?: (analysis: EmailAnalysis) => void;
}

export function EmailAnalysisTabContent({
  emailId,
  analysis,
  onAnalysisUpdated,
}: EmailAnalysisTabContentProps) {
  const { t } = useI18n();
  const { authUser, getIdToken } = useAuth();
  const [refreshingAnalysis, setRefreshingAnalysis] = useState(false);

  const handleRepeatAnalysis = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (!authUser || refreshingAnalysis) {
      return;
    }

    setRefreshingAnalysis(true);
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/email/${emailId}/analysis`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => null)) as { analysis?: EmailAnalysis } | null;

      if (!response.ok || !data?.analysis) {
        toast.error(t.dashboard.toasts.analysisRefreshFailed);
        return;
      }

      onAnalysisUpdated?.(data.analysis);
      toast.success(t.dashboard.toasts.analysisRefreshed);
    } catch (error) {
      console.error('Failed to refresh email analysis:', error);
      toast.error(t.dashboard.toasts.analysisRefreshFailed);
    } finally {
      setRefreshingAnalysis(false);
    }
  };

  return (
    <div className="space-y-3">
      {!analysis ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
          {t.dashboard.emailHistory.noAiAnalysis}
        </p>
      ) : (
        <EmailAnalysisPanel analysis={analysis} />
      )}
      <div className="flex justify-start">
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={refreshingAnalysis}
          disabled={!authUser}
          onClick={handleRepeatAnalysis}
        >
          {!refreshingAnalysis && <RefreshCw className="h-3.5 w-3.5" />}
          {refreshingAnalysis
            ? t.dashboard.emailHistory.rerunningAnalysis
            : t.dashboard.emailHistory.rerunAnalysis}
        </Button>
      </div>
    </div>
  );
}
