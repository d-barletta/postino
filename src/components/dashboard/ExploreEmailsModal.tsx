'use client';

import { toast } from 'sonner';
import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { EmailDeleteDrawer } from '@/components/dashboard/EmailDeleteDrawer';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useModalHistory } from '@/hooks/useModalHistory';
import { useEmailReadActions } from '@/hooks/useEmailReadActions';
import { useEmailExpansion } from '@/hooks/useEmailExpansion';
import { Mail, RefreshCw } from 'lucide-react';
import type { EmailAnalysis, EmailLog, LogsResponse } from '@/types';
import { ResultsPagination } from '@/components/dashboard/ResultsPagination';
import { EmailListItem, EmailRowSkeleton } from '@/components/dashboard/EmailListItem';

const PAGE_SIZE = 20;

export interface ExploreEmailsModalProps {
  /** The term to search for (chip value). Null means the modal is closed (in term mode). */
  term: string | null;
  /** Category key: 'topics' | 'people' | 'organizations' | 'places' | 'events' */
  category: string;
  /** Human-readable label shown in the modal header */
  categoryLabel: string;
  onClose: () => void;
  /** Called immediately when user requests fullscreen view of an email (may be called with loading=true before body is ready) */
  onRequestFullscreen: (email: {
    subject: string;
    body: string | null;
    processedBody?: string | null;
    loading?: boolean;
  }) => void;
  /** Called once the email body has loaded to update the fullscreen dialog opened by onRequestFullscreen */
  onUpdateFullscreen?: (
    update: Partial<{ body: string | null; processedBody: string | null; loading: boolean }>,
  ) => void;
  /**
   * Optional list of alias values that the term was merged from.
   * When provided, the search will match any of these aliases instead of the term alone.
   */
  aliases?: string[];
  /**
   * When provided, the modal shows these specific emails by ID instead of
   * searching by term. The modal is open when this array is non-empty and term is null.
   */
  logIds?: string[];
  /** Title shown in the modal header when in logIds mode. */
  sourceTitle?: string;
}

export function ExploreEmailsModal({
  term,
  category,
  categoryLabel,
  onClose,
  onRequestFullscreen,
  onUpdateFullscreen,
  aliases,
  logIds,
  sourceTitle,
}: ExploreEmailsModalProps) {
  const { t } = useI18n();
  const { authUser, getIdToken } = useAuth();
  const tk = t.dashboard.knowledge;

  const isLogIdsMode = !term && !!logIds && logIds.length > 0;
  const isOpen = !!term || isLogIdsMode;

  // Integrate with browser history so the Back button closes this modal.
  useModalHistory(isOpen, onClose);

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { expandedData, fetchExpandedEmail, resetExpanded } = useEmailExpansion();
  const { markEmailAsRead, toggleEmailRead } = useEmailReadActions(setLogs);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('summary');
  const [deleteEmailId, setDeleteEmailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // When set, we're waiting for this email's body to load before opening fullscreen.
  const [pendingFullscreenId, setPendingFullscreenId] = useState<string | null>(null);

  const handleAnalysisUpdated = useCallback((emailId: string, analysis: EmailAnalysis) => {
    setLogs((prev) =>
      prev.map((log) => (log.id === emailId ? { ...log, emailAnalysis: analysis } : log)),
    );
  }, []);

  const fetchLogs = useCallback(
    async (targetPage: number) => {
      if (!authUser || !term) return;
      setLoading(true);
      setTotalCount(undefined);
      try {
        const token = await getIdToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        // When aliases are provided (merged entity), use OR-matched terms search.
        // Otherwise use plain text search.
        if (aliases && aliases.length > 0) {
          for (const alias of aliases) {
            params.append('terms', alias.trim());
          }
        } else {
          params.set('search', term.trim());
        }
        const res = await fetch(`/api/email/logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: LogsResponse = await res.json();
          setLogs(data.logs ?? []);
          setPage(data.page);
          setHasNextPage(data.hasNextPage);
          setTotalPages(data.totalPages);
          setTotalCount(data.totalCount);
        } else {
          toast.error(t.dashboard.emailHistory.failedToLoad);
        }
      } finally {
        setLoading(false);
      }
    },
    [authUser, term, category, aliases],
  );

  const fetchLogsByIds = useCallback(
    async (ids: string[]) => {
      if (!authUser || ids.length === 0) return;
      setLoading(true);
      setTotalCount(undefined);
      try {
        const token = await getIdToken();
        const res = await fetch('/api/email/by-ids', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        });
        if (res.ok) {
          const data: { logs: EmailLog[] } = await res.json();
          const logOrder = new Map(ids.map((id, index) => [id, index]));
          const orderedLogs = [...(data.logs ?? [])].sort(
            (left, right) =>
              (logOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
              (logOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
          );
          setLogs(orderedLogs);
          setHasNextPage(false);
          setTotalPages(1);
          setTotalCount(orderedLogs.length);
        } else {
          toast.error(t.dashboard.emailHistory.failedToLoad);
        }
      } finally {
        setLoading(false);
      }
    },
    [authUser],
  );

  // Reset + fetch when modal opens (term changes)
  useEffect(() => {
    if (!term) return;
    setLogs([]);
    setPage(1);
    setSelectedId(null);
    resetExpanded();
    fetchLogs(1);
  }, [term, fetchLogs]);

  // Reset + fetch when logIds mode opens
  useEffect(() => {
    if (!isLogIdsMode || !logIds) return;
    setLogs([]);
    setPage(1);
    setSelectedId(null);
    resetExpanded();
    fetchLogsByIds(logIds);
  }, [isLogIdsMode, logIds, fetchLogsByIds]);

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
    } else {
      setSelectedId(logId);
      setActiveDetailTab('summary');
      fetchExpandedEmail(logId);
      const log = logs.find((l) => l.id === logId);
      if (log?.isRead === false) markEmailAsRead(logId);
    }
  };

  // Once pending fullscreen email body is loaded, update the already-open fullscreen dialog.
  useEffect(() => {
    if (!pendingFullscreenId) return;
    const data = expandedData[pendingFullscreenId];
    if (!data || data.loading) return;
    onUpdateFullscreen?.({
      body: data.originalBody ?? null,
      processedBody: data.processedBody ?? null,
      loading: false,
    });
    setPendingFullscreenId(null);
  }, [pendingFullscreenId, expandedData, onUpdateFullscreen]);

  const handleDeleteEmail = useCallback(async () => {
    if (!deleteEmailId || !authUser) return;
    setDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/email/${deleteEmailId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setLogs((prev) => prev.filter((l) => l.id !== deleteEmailId));
        if (selectedId === deleteEmailId) setSelectedId(null);
        if (totalCount !== undefined)
          setTotalCount((c) => (c !== undefined ? Math.max(0, c - 1) : undefined));
        setDeleteEmailId(null);
      } else {
        console.error('Failed to delete email:', await res.text());
        toast.error(t.dashboard.emailHistory.deleteEmailError);
        setDeleteEmailId(null);
      }
    } catch (err) {
      console.error('Failed to delete email:', err);
      toast.error(t.dashboard.emailHistory.deleteEmailError);
      setDeleteEmailId(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteEmailId, authUser, selectedId, t, totalCount]);

  const handlePageChange = (newPage: number) => {
    setSelectedId(null);
    fetchLogs(newPage);
    setPage(newPage);
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          animation="slide-from-bottom"
          className="w-screen h-screen max-w-5xl flex flex-col p-0 overflow-hidden gap-0 z-52"
          aria-describedby={undefined}
          hideCloseButton
        >
          {/* Header with tag/category info */}
          <DialogHeader className="shrink-0 px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5 flex-wrap">
              {isLogIdsMode ? (
                (sourceTitle ?? tk.relatedEmailsDesc)
              ) : (
                <>
                  {tk.relatedEmailsDesc}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]">
                    {categoryLabel}: {term}
                  </span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isLogIdsMode
                ? (sourceTitle ?? tk.relatedEmailsDesc)
                : `${tk.relatedEmailsDesc} ${categoryLabel}: ${term}`}
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable email list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 8 }).map((_, i) => (
                  <EmailRowSkeleton key={i} />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{tk.noRelatedEmails}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log) => (
                  <EmailListItem
                    key={log.id}
                    log={log}
                    expandedData={expandedData[log.id]}
                    isSelected={selectedId === log.id}
                    activeDetailTab={activeDetailTab}
                    onToggleExpand={() => handleToggleExpand(log.id)}
                    onTabChange={setActiveDetailTab}
                    onFullscreen={() => {
                      fetchExpandedEmail(log.id);
                      if (log.isRead === false) markEmailAsRead(log.id);
                      onRequestFullscreen({ subject: log.subject, body: null, loading: true });
                      setPendingFullscreenId(log.id);
                    }}
                    onViewFullscreen={(body) => {
                      fetchExpandedEmail(log.id);
                      if (log.isRead === false) markEmailAsRead(log.id);
                      const expanded = expandedData[log.id];
                      onRequestFullscreen({
                        subject: log.subject,
                        body: expanded?.originalBody ?? body,
                        processedBody: expanded?.processedBody ?? null,
                        loading: false,
                      });
                    }}
                    onDelete={() => setDeleteEmailId(log.id)}
                    onToggleRead={() => toggleEmailRead(log.id, log.isRead !== false)}
                    onAnalysisUpdated={(analysis) => handleAnalysisUpdated(log.id, analysis)}
                    statusLayout="side"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer: result count + optional pagination + close button */}
          <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-6 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            {/* Left: result count */}
            <span
              role="status"
              aria-live="polite"
              className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5"
            >
              {loading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : totalCount !== undefined ? (
                <>
                  {totalCount} {t.dashboard.emailHistory.results}
                </>
              ) : null}
            </span>

            {/* Center: pagination (only when needed) */}
            {!loading && (hasNextPage || page > 1 || (totalPages ?? 0) > 1) && (
              <ResultsPagination
                page={page}
                totalPages={totalPages}
                hasNextPage={hasNextPage}
                disabled={loading}
                previousLabel={t.dashboard.emailHistory.previous}
                nextLabel={t.dashboard.emailHistory.next}
                onPageChange={handlePageChange}
              />
            )}

            {/* Right: close button */}
            <Button
              size="sm"
              onClick={onClose}
              aria-label={t.dashboard.rules.close}
              className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
            >
              {t.dashboard.rules.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EmailDeleteDrawer
        open={!!deleteEmailId}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleteEmailId(null);
        }}
        onConfirm={handleDeleteEmail}
      />
    </>
  );
}
