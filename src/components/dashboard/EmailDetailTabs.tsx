'use client';

import { useState } from 'react';
import { Eye, AlignLeft, Brain, AlertTriangle, AlertCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { SafeEmailIframe } from '@/components/ui/SafeEmailIframe';
import { AttachmentList } from '@/components/dashboard/AttachmentList';
import { EmailAnalysisTabContent } from '@/components/dashboard/EmailAnalysisTabContent';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import type { EmailAnalysis, EmailLog } from '@/types';
import type { ExpandedEmailData } from '@/components/dashboard/EmailListItem';

interface EmailDetailTabsProps {
  log: EmailLog;
  emailData: ExpandedEmailData | undefined;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onFullscreen: () => void;
  /** Called with the currently-displayed body and showRewritten state when the eye button is clicked.
   *  When provided this takes precedence over `onFullscreen` for the eye button. */
  onViewFullscreen?: (body: string | null, showRewritten: boolean) => void;
  onAnalysisUpdated?: (analysis: EmailAnalysis) => void;
  onCreditsUsed?: () => void;
  className?: string;
  summaryClassName?: string;
  fillAvailableHeight?: boolean;
}

export function EmailDetailTabs({
  log,
  emailData,
  activeTab,
  onTabChange,
  onFullscreen,
  onViewFullscreen,
  onAnalysisUpdated,
  onCreditsUsed,
  className,
  summaryClassName,
  fillAvailableHeight = false,
}: EmailDetailTabsProps) {
  const { t } = useI18n();
  const hasRewritten = Boolean(emailData?.processedBody);
  const showRewriteWarning = Boolean(log.ruleApplied && log.status === 'error' && log.errorMessage);
  const [showRewritten, setShowRewritten] = useState(false);

  // The body currently displayed in the iframe
  const displayBody =
    hasRewritten && showRewritten
      ? (emailData?.processedBody ?? null)
      : (emailData?.originalBody ?? null);

  const handleEyeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onViewFullscreen) {
      onViewFullscreen(displayBody, showRewritten);
    } else {
      onFullscreen();
    }
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={onTabChange}
      className={cn(fillAvailableHeight && 'flex min-h-0 flex-1 flex-col', className)}
    >
      <TabsList>
        <TabsTrigger value="summary">
          <AlignLeft className="h-3.5 w-3.5 shrink-0 mr-1.5" />
          {t.dashboard.emailHistory.tabSummary}
        </TabsTrigger>
        <TabsTrigger value="ai">
          <Brain className="h-3.5 w-3.5 shrink-0 mr-1.5" />
          {t.dashboard.emailHistory.tabAiAnalysis}
        </TabsTrigger>
      </TabsList>

      {/* Details tab */}
      <TabsContent
        value="summary"
        className={cn(
          fillAvailableHeight
            ? 'mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden'
            : 'mt-3 space-y-3',
          summaryClassName,
        )}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-gray-500 dark:text-gray-400 font-medium">
            {t.dashboard.emailHistory.to}
          </dt>
          <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{log.toAddress}</dd>
          {emailData?.ccAddress && (
            <>
              <dt className="text-gray-500 dark:text-gray-400 font-medium">
                {t.dashboard.emailHistory.cc}
              </dt>
              <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                {emailData.ccAddress}
              </dd>
            </>
          )}
          {emailData?.bccAddress && (
            <>
              <dt className="text-gray-500 dark:text-gray-400 font-medium">
                {t.dashboard.emailHistory.bcc}
              </dt>
              <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                {emailData.bccAddress}
              </dd>
            </>
          )}
          <dt className="text-gray-500 dark:text-gray-400 font-medium">
            {t.dashboard.emailHistory.attachments}
          </dt>
          <dd className="text-gray-700 dark:text-gray-300 min-w-0 overflow-hidden">
            {emailData?.loading ? (
              <span className="text-gray-400">…</span>
            ) : (emailData?.attachmentCount ?? log.attachmentCount ?? 0) > 0 ? (
              <AttachmentList
                emailId={log.id}
                names={emailData?.attachmentNames ?? log.attachmentNames ?? []}
                attachments={emailData?.attachments}
              />
            ) : (
              <span className="text-gray-400">{t.dashboard.emailHistory.noAttachmentsShort}</span>
            )}
          </dd>
        </dl>

        {log.ruleApplied && (
          <p className="text-xs text-gray-600 dark:text-gray-300">
            <span className="font-medium">{t.dashboard.emailHistory.ruleApplied}</span>{' '}
            {log.ruleApplied}
          </p>
        )}

        {showRewriteWarning && (
          <Alert variant="destructive" className="text-xs flex text-center">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertDescription>{t.dashboard.emailHistory.rewriteFailedWarning}</AlertDescription>
          </Alert>
        )}

        {log.status === 'skipped' && log.errorMessage && (
          <Alert variant="warning" className="text-left text-xs">
            <AlertCircle className="h-3.5 w-3.5" />
            <AlertDescription>
              <span className="font-medium">{t.dashboard.emailHistory.skipReason}</span>{' '}
              {log.errorMessage}
            </AlertDescription>
          </Alert>
        )}

        {emailData?.loading && (
          <div className="animate-pulse space-y-2 pt-1">
            <div className="h-50 w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        )}
        {emailData && !emailData.loading && emailData.originalBody && (
          <div className={cn(fillAvailableHeight && 'min-h-0 flex-1 flex flex-col')}>
            {hasRewritten && !showRewriteWarning && (
              <div className="flex items-center gap-1 mb-2 shrink-0">
                <button
                  onClick={() => setShowRewritten(false)}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                    !showRewritten
                      ? 'bg-[#efd957] text-black'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                  )}
                >
                  {t.emailOriginal.viewOriginal}
                </button>
                <button
                  onClick={() => setShowRewritten(true)}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                    showRewritten
                      ? 'bg-[#efd957] text-black'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                  )}
                >
                  {t.emailOriginal.viewRewritten}
                </button>
              </div>
            )}
            <div className={cn('relative', fillAvailableHeight && 'min-h-0 flex-1')}>
              <SafeEmailIframe
                html={displayBody ?? emailData.originalBody}
                autoResize={!fillAvailableHeight}
                className={cn('rounded-lg', fillAvailableHeight && 'h-full')}
                style={
                  fillAvailableHeight
                    ? { height: '100%' }
                    : { minHeight: '200px', maxHeight: '400px' }
                }
                maxAutoHeight={fillAvailableHeight ? undefined : 400}
              />
              <button
                onClick={handleEyeClick}
                className="absolute top-2 right-2 p-1.5 rounded bg-[#efd957] text-black hover:bg-[#e4cf53] shadow-sm transition-colors"
                title={t.emailOriginal.openFullPageView}
                aria-label={t.emailOriginal.openFullPageView}
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        {emailData && !emailData.loading && !emailData.originalBody && !emailData.error && (
          <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
            {t.emailOriginal.noOriginalContent}
          </p>
        )}
      </TabsContent>

      {/* AI Analysis tab */}
      <TabsContent value="ai" className="mt-3 space-y-3">
        <EmailAnalysisTabContent
          emailId={log.id}
          analysis={log.emailAnalysis}
          onAnalysisUpdated={onAnalysisUpdated}
          onCreditsUsed={onCreditsUsed}
        />
        {log.tokensUsed !== undefined && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t.dashboard.emailHistory.credits}{' '}
            {Math.ceil(log.estimatedCredits || 0).toLocaleString()}
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
