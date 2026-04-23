'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmailDetailTabs } from '@/components/dashboard/EmailDetailTabs';
import { Spinner } from '@/components/ui/Spinner';
import { formatDate, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
  Mail,
  Paperclip,
  Trash2,
  Eye,
  MailOpen,
  CheckCircle,
  MailWarning,
  Inbox,
  MinusCircle,
} from 'lucide-react';
import type { EmailAnalysis, EmailAttachmentInfo, EmailLog } from '@/types';

// ---------------------------------------------------------------------------
// Shared color maps (exported so parents can use them for filter chips, etc.)
// ---------------------------------------------------------------------------
export const DEFAULT_BADGE_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

/** Format a From header value as `Name <email>` (stripping outer quotes from the display name).
 *  Falls back to the raw value when no angle-bracket form is present. */
function extractSenderDisplay(addr: string): string {
  const match = addr.match(/^"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (match) return `${match[1].trim()} <${match[2].trim()}>`;
  return addr;
}

export const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: DEFAULT_BADGE_COLOR,
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export const TYPE_COLORS: Record<string, string> = {
  newsletter: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  transactional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  promotional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  personal: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  notification: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  automated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  other: DEFAULT_BADGE_COLOR,
};

// ---------------------------------------------------------------------------
// ExpandedEmailData
// ---------------------------------------------------------------------------
export interface ExpandedEmailData {
  originalBody: string | null;
  /** AI-rewritten body produced by a rule. Present only when a rule rewrote the email. */
  processedBody?: string | null;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;
  attachmentCount: number;
  attachmentNames: string[];
  attachments: EmailAttachmentInfo[];
  loading: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// EmailRowSkeleton
// ---------------------------------------------------------------------------
export function EmailRowSkeleton() {
  return (
    <div className="px-6 py-4 animate-pulse">
      <div className="flex items-start gap-2">
        <div className="mt-1 h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="flex gap-1.5">
            <div className="h-4 w-14 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-4 w-10 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SwipeableEmailRow — iOS Mail-style swipe-to-reveal actions.
// Works with mouse, touch and stylus via the Pointer Events API.
// Normal tap/click passes through unchanged; only horizontal drags reveal actions.
// ---------------------------------------------------------------------------
const SWIPE_ACTION_WIDTH = 192; // 64 px per action button × 3
const DRAG_THRESHOLD = 6; // px of movement before we commit to a drag

export function SwipeableEmailRow({
  children,
  onOpen,
  onDelete,
  onToggleRead = () => {},
  isRead,
}: {
  children: React.ReactNode;
  onOpen: () => void;
  onDelete: () => void;
  onToggleRead?: () => void;
  isRead: boolean;
}) {
  const { t } = useI18n();
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [isSnapped, setIsSnapped] = useState(false);

  const liveOffset = useRef(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const startOffset = useRef(0);
  const isDragging = useRef(false);
  const suppressNextClick = useRef(false);
  const skipNextClose = useRef(false);

  const applyOffset = (v: number, smooth: boolean) => {
    liveOffset.current = v;
    setAnimate(smooth);
    setOffset(v);
  };

  const close = useCallback(() => {
    applyOffset(0, true);
    setIsSnapped(false);
  }, []);

  const snapOpen = useCallback(() => {
    applyOffset(-SWIPE_ACTION_WIDTH, true);
    setIsSnapped(true);
  }, []);

  useEffect(() => {
    if (!isSnapped) return;
    const handler = () => {
      if (skipNextClose.current) {
        skipNextClose.current = false;
        return;
      }
      close();
    };
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', handler);
    }, 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', handler);
    };
  }, [isSnapped, close]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
    startOffset.current = liveOffset.current;
    isDragging.current = false;
    suppressNextClick.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;

    if (!isDragging.current) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerStart.current = null;
        return;
      }
      isDragging.current = true;
      suppressNextClick.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    setAnimate(false);
    const next = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, startOffset.current + dx));
    liveOffset.current = next;
    setOffset(next);
  };

  const onPointerUp = () => {
    if (!isDragging.current) {
      pointerStart.current = null;
      return;
    }
    isDragging.current = false;
    pointerStart.current = null;
    if (liveOffset.current < -SWIPE_ACTION_WIDTH / 2) {
      snapOpen();
    } else {
      close();
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false;
      e.stopPropagation();
      return;
    }
    if (isSnapped) {
      close();
      e.stopPropagation();
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action buttons — hidden behind the row until swiped */}
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{
          width: SWIPE_ACTION_WIDTH,
          opacity: Math.abs(offset) / SWIPE_ACTION_WIDTH,
          transition: animate ? 'opacity 0.22s ease' : 'none',
        }}
      >
        <button
          className="flex-1 flex items-center justify-center bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white transition-colors"
          onPointerDown={() => {
            skipNextClose.current = true;
          }}
          onClick={(e) => {
            e.stopPropagation();
            close();
            onToggleRead();
          }}
          aria-label={
            isRead ? t.dashboard.emailHistory.markUnread : t.dashboard.emailHistory.markRead
          }
        >
          {isRead ? <Mail className="h-5 w-5" /> : <MailOpen className="h-5 w-5" />}
        </button>
        <button
          className="flex-1 flex items-center justify-center bg-[#efd957] hover:bg-[#d0b53f] active:bg-[#b89c2e] text-white transition-colors"
          onPointerDown={() => {
            skipNextClose.current = true;
          }}
          onClick={(e) => {
            e.stopPropagation();
            close();
            onOpen();
          }}
          aria-label={t.dashboard.emailHistory.viewFullPage}
        >
          <Eye className="h-5 w-5" />
        </button>
        <button
          className="flex-1 flex items-center justify-center bg-red-500 hover:bg-red-600 active:bg-red-700 text-white transition-colors"
          onPointerDown={() => {
            skipNextClose.current = true;
          }}
          onClick={(e) => {
            e.stopPropagation();
            close();
            onDelete();
          }}
          aria-label={t.dashboard.emailHistory.deleteEmail}
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </div>

      {/* Sliding content — solid background so it fully covers the buttons */}
      <div
        className="bg-white dark:bg-gray-900"
        style={{
          transform: `translateX(${offset}px)`,
          transition: animate ? 'transform 0.22s ease' : 'none',
          touchAction: 'pan-y',
          willChange: 'transform',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmailListItem
// ---------------------------------------------------------------------------
export interface EmailListItemProps {
  log: EmailLog;
  expandedData?: ExpandedEmailData;
  isSelected: boolean;
  activeDetailTab: string;
  onToggleExpand: () => void;
  onTabChange: (tab: string) => void;
  /** Called when user clicks "view full page" button or swipes to open */
  onFullscreen: () => void;
  /** Called from the eye button with the currently-displayed body (original or rewritten). */
  onViewFullscreen?: (body: string | null, showRewritten: boolean) => void;
  /** If provided, enables swipe-to-delete and the swipe delete action */
  onDelete?: () => void;
  /** If provided, enables swipe-to-toggle-read and the swipe toggle action */
  onToggleRead?: () => void;
  /** Called when AI analysis is updated for this email */
  onAnalysisUpdated?: (analysis: EmailAnalysis) => void;
  /** Called when AI analysis uses credits (triggers stats refresh) */
  onCreditsUsed?: () => void;
  /**
   * 'side'   — status + date on the right of the top row (modal style)
   * 'bottom' — status + date in a separate bottom row (narrow list style, default)
   */
  statusLayout?: 'side' | 'bottom';
}

export function EmailListItem({
  log,
  expandedData,
  isSelected,
  activeDetailTab,
  onToggleExpand,
  onTabChange,
  onFullscreen,
  onViewFullscreen,
  onDelete,
  onToggleRead,
  onAnalysisUpdated,
  onCreditsUsed,
  statusLayout = 'bottom',
}: EmailListItemProps) {
  const { t, locale } = useI18n();
  const ts = t.dashboard.search;

  const statusLabel: Record<string, string> = {
    received: t.dashboard.charts.received,
    processing: t.dashboard.charts.processing,
    forwarded: t.dashboard.charts.forwarded,
    error: t.dashboard.charts.error,
    skipped: t.dashboard.charts.skipped,
  };

  const statusVariant: Record<
    string,
    'info' | 'warning' | 'success' | 'error' | 'default' | 'skipped'
  > = {
    received: 'info',
    processing: 'default',
    forwarded: 'success',
    error: 'error',
    skipped: 'skipped',
  };

  const rowTypeLabel: Record<string, string> = {
    newsletter: ts.typeNewsletter,
    transactional: ts.typeTransactional,
    promotional: ts.typePromotional,
    personal: ts.typePersonal,
    notification: ts.typeNotification,
    automated: ts.typeAutomated,
    other: ts.typeOther,
  };

  const rowSentimentLabel: Record<string, string> = {
    positive: ts.sentimentPositive,
    neutral: ts.sentimentNeutral,
    negative: ts.sentimentNegative,
  };

  const rowPriorityLabel: Record<string, string> = {
    low: ts.priorityLow,
    normal: ts.priorityNormal,
    high: ts.priorityHigh,
    critical: ts.priorityCritical,
  };

  const hasAtt = (log.attachmentCount ?? 0) > 0;
  const isUnread = log.isRead === false;

  const emailIcon = (
    <div className="relative mt-0.5 shrink-0">
      {hasAtt ? (
        <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      ) : isUnread ? (
        <Mail className="h-4 w-4 text-gray-600 dark:text-gray-200" />
      ) : (
        <MailOpen className="h-4 w-4 text-gray-200 dark:text-gray-700 opacity-60" />
      )}
      {isUnread && (
        <span className="absolute -top-0.5 -left-0.5 w-2 h-2 rounded-full bg-blue-500" />
      )}
    </div>
  );

  const statusIcon: Record<string, React.ReactNode> = {
    received: <Inbox className="h-3 w-3 mr-1 shrink-0" />,
    processing: <Spinner className="h-3 w-3 mr-1 shrink-0" />,
    forwarded: <CheckCircle className="h-3 w-3 my-1 shrink-0" />,
    error: <MailWarning className="h-3 w-3 mr-1 shrink-0" />,
    skipped: <MinusCircle className="h-3 w-3 mr-1 shrink-0" />,
  };

  const statusAndDate = (
    <>
      <Badge variant={statusVariant[log.status] || 'default'}>
        {statusIcon[log.status]}
        {log.status !== 'forwarded' ? (statusLabel[log.status] ?? log.status) : ''}
      </Badge>
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {formatDate(log.receivedAt, locale)}
      </span>
    </>
  );

  const itemRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSelected && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  const rowContent = (
    <div
      ref={itemRef}
      className={cn(
        'px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors',
        isSelected && 'bg-yellow-50/70 dark:bg-yellow-900/10',
      )}
      onClick={onToggleExpand}
    >
      {statusLayout === 'side' ? (
        /* Modal layout: left content + right status/date */
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex items-start gap-2">
            {emailIcon}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">
                {log.subject}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                {t.dashboard.emailHistory.from} {extractSenderDisplay(log.fromAddress)}
              </p>
              {log.emailAnalysis && (
                <AnalysisSection
                  log={log}
                  rowTypeLabel={rowTypeLabel}
                  rowSentimentLabel={rowSentimentLabel}
                  rowPriorityLabel={rowPriorityLabel}
                  t={t}
                  ts={ts}
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">{statusAndDate}</div>
        </div>
      ) : (
        /* Narrow list layout: stacked, status/date in a separate bottom row */
        <div className="flex flex-col gap-2">
          <div className="min-w-0 flex items-start gap-2">
            {emailIcon}
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">
                {log.subject}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                {t.dashboard.emailHistory.from} {extractSenderDisplay(log.fromAddress)}
              </p>
              {log.emailAnalysis && (
                <AnalysisSection
                  log={log}
                  rowTypeLabel={rowTypeLabel}
                  rowSentimentLabel={rowSentimentLabel}
                  rowPriorityLabel={rowPriorityLabel}
                  t={t}
                  ts={ts}
                />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between shrink-0 pl-6">
            <div className="flex items-center gap-2">{statusAndDate}</div>
          </div>
        </div>
      )}

      {/* Expanded detail panel */}
      {isSelected && (
        <div
          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 pl-6"
          onClick={(e) => e.stopPropagation()}
        >
          <EmailDetailTabs
            log={log}
            emailData={expandedData}
            activeTab={activeDetailTab}
            onTabChange={onTabChange}
            onFullscreen={onFullscreen}
            onViewFullscreen={onViewFullscreen}
            onAnalysisUpdated={onAnalysisUpdated}
            onCreditsUsed={onCreditsUsed}
          />
        </div>
      )}
    </div>
  );

  if (onDelete) {
    return (
      <SwipeableEmailRow
        onOpen={onFullscreen}
        onDelete={onDelete}
        onToggleRead={onToggleRead}
        isRead={log.isRead !== false}
      >
        {rowContent}
      </SwipeableEmailRow>
    );
  }

  return rowContent;
}

// ---------------------------------------------------------------------------
// Internal helper: analysis badges + topics
// ---------------------------------------------------------------------------
function AnalysisSection({
  log,
  rowTypeLabel,
  rowSentimentLabel,
  rowPriorityLabel,
  t,
  ts,
}: {
  log: EmailLog;
  rowTypeLabel: Record<string, string>;
  rowSentimentLabel: Record<string, string>;
  rowPriorityLabel: Record<string, string>;

  t: any;

  ts: any;
}) {
  const analysis = log.emailAnalysis;
  if (!analysis) return null;
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap gap-1">
        {analysis.emailType && (
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
              TYPE_COLORS[analysis.emailType] ?? DEFAULT_BADGE_COLOR,
            )}
          >
            {rowTypeLabel[analysis.emailType] ?? analysis.emailType}
          </span>
        )}
        {analysis.sentiment && (
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
              SENTIMENT_COLORS[analysis.sentiment] ?? DEFAULT_BADGE_COLOR,
            )}
          >
            {rowSentimentLabel[analysis.sentiment] ?? analysis.sentiment}
          </span>
        )}
        {analysis.priority && analysis.priority !== 'normal' && (
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium',
              PRIORITY_COLORS[analysis.priority] ?? DEFAULT_BADGE_COLOR,
            )}
          >
            {rowPriorityLabel[analysis.priority] ?? analysis.priority}
          </span>
        )}
        {analysis.requiresResponse && (
          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
            {t.dashboard.emailHistory.analysisRequiresResponse}
          </span>
        )}
        {analysis.isUrgent && (
          <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {ts.isUrgent}
          </span>
        )}
      </div>
      {analysis.topics && analysis.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {analysis.topics.slice(0, 3).map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]"
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
