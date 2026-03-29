'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/Accordion';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Mail,
  Paperclip,
  ExternalLink,
  Search,
  X,
} from 'lucide-react';
import type { EmailLog } from '@/types';
import { EmailAnalysisPanel } from '@/components/dashboard/EmailAnalysisPanel';

const PAGE_SIZE = 20;
const ALL_VALUE = '__all__';

const DEFAULT_BADGE_COLOR = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  negative: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: DEFAULT_BADGE_COLOR,
  normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const TYPE_COLORS: Record<string, string> = {
  newsletter: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  transactional: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  promotional: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  personal: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  notification: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  automated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  other: DEFAULT_BADGE_COLOR,
};

// ---------------------------------------------------------------------------
// Filter state shape
// ---------------------------------------------------------------------------
interface FilterState {
  search: string;
  status: string;
  sentiment: string;
  emailType: string;
  priority: string;
  senderType: string;
  language: string;
  tags: string;
  attachments: boolean;
  requiresResponse: boolean;
  hasActionItems: boolean;
  isUrgent: boolean;
}

const EMPTY_FILTERS: FilterState = {
  search: '',
  status: '',
  sentiment: '',
  emailType: '',
  priority: '',
  senderType: '',
  language: '',
  tags: '',
  attachments: false,
  requiresResponse: false,
  hasActionItems: false,
  isUrgent: false,
};

function filtersEqual(a: FilterState, b: FilterState): boolean {
  return (
    a.search.trim() === b.search.trim() &&
    a.status === b.status &&
    a.sentiment === b.sentiment &&
    a.emailType === b.emailType &&
    a.priority === b.priority &&
    a.senderType === b.senderType &&
    a.language.trim().toLowerCase() === b.language.trim().toLowerCase() &&
    a.tags.trim().toLowerCase() === b.tags.trim().toLowerCase() &&
    a.attachments === b.attachments &&
    a.requiresResponse === b.requiresResponse &&
    a.hasActionItems === b.hasActionItems &&
    a.isUrgent === b.isUrgent
  );
}

function hasActiveFilter(f: FilterState): boolean {
  return (
    !!f.search || !!f.status || !!f.sentiment || !!f.emailType ||
    !!f.priority || !!f.senderType || !!f.language || !!f.tags ||
    f.attachments || f.requiresResponse || f.hasActionItems || f.isUrgent
  );
}


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LogsResponse {
  logs: EmailLog[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  totalCount?: number;
  totalPages?: number;
}

interface ExpandedEmailData {
  originalBody: string | null;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;
  attachmentCount: number;
  attachmentNames: string[];
  loading: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface EmailSearchTabProps {
  selectedEmailId?: string;
  refreshTrigger?: number;
}

export function EmailSearchTab({ selectedEmailId, refreshTrigger }: EmailSearchTabProps) {
  const { t, locale } = useI18n();
  const { firebaseUser, user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const ts = t.dashboard.search;

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedEmailData>>({});
  const [fullscreenEmailId, setFullscreenEmailId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('summary');

  const fetchedExpandedIds = useRef<Set<string>>(new Set());

  // Pending = staged in UI, not yet applied to the server
  const [pending, setPending] = useState<FilterState>(EMPTY_FILTERS);
  // Applied = currently active server-side filters
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  const statusLabel: Record<string, string> = {
    received: t.dashboard.charts.received,
    processing: t.dashboard.charts.processing,
    forwarded: t.dashboard.charts.forwarded,
    error: t.dashboard.charts.error,
    skipped: t.dashboard.charts.skipped,
  };

  const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
    received: 'info',
    processing: 'warning',
    forwarded: 'success',
    error: 'error',
    skipped: 'default',
  };

  const STATUS_OPTIONS = [
    { value: ALL_VALUE, label: t.dashboard.emailHistory.allStatuses },
    { value: 'received', label: t.dashboard.charts.received },
    { value: 'processing', label: t.dashboard.charts.processing },
    { value: 'forwarded', label: t.dashboard.charts.forwarded },
    { value: 'error', label: t.dashboard.charts.error },
    { value: 'skipped', label: t.dashboard.charts.skipped },
  ];

  const SENTIMENT_OPTIONS = [
    { value: ALL_VALUE, label: ts.allSentiments },
    { value: 'positive', label: ts.sentimentPositive },
    { value: 'neutral', label: ts.sentimentNeutral },
    { value: 'negative', label: ts.sentimentNegative },
  ];

  const EMAIL_TYPE_OPTIONS = [
    { value: ALL_VALUE, label: ts.allCategories },
    { value: 'newsletter', label: ts.typeNewsletter },
    { value: 'transactional', label: ts.typeTransactional },
    { value: 'promotional', label: ts.typePromotional },
    { value: 'personal', label: ts.typePersonal },
    { value: 'notification', label: ts.typeNotification },
    { value: 'automated', label: ts.typeAutomated },
    { value: 'other', label: ts.typeOther },
  ];

  const PRIORITY_OPTIONS = [
    { value: ALL_VALUE, label: ts.allPriorities },
    { value: 'low', label: ts.priorityLow },
    { value: 'normal', label: ts.priorityNormal },
    { value: 'high', label: ts.priorityHigh },
    { value: 'critical', label: ts.priorityCritical },
  ];

  const SENDER_TYPE_OPTIONS = [
    { value: ALL_VALUE, label: ts.allSenderTypes },
    { value: 'human', label: ts.senderHuman },
    { value: 'automated', label: ts.senderAutomated },
    { value: 'business', label: ts.senderBusiness },
    { value: 'newsletter', label: ts.senderNewsletter },
  ];

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

  const fetchLogs = useCallback(async (targetPage: number, isRefresh = false) => {
    if (!firebaseUser) return;
    if (isRefresh) setRefreshing(true);
    else setLogsLoading(true);
    setTotalCount(undefined);
    try {
      const token = await firebaseUser.getIdToken();
      const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
      if (applied.search) params.set('search', applied.search);
      if (applied.status) params.set('status', applied.status);
      if (applied.sentiment) params.set('sentiment', applied.sentiment);
      if (applied.emailType) params.set('emailType', applied.emailType);
      if (applied.priority) params.set('priority', applied.priority);
      if (applied.senderType) params.set('senderType', applied.senderType);
      if (applied.language) params.set('language', applied.language.trim().toLowerCase());
      if (applied.tags) params.set('tags', applied.tags.trim().toLowerCase());
      if (applied.attachments) params.set('hasAttachments', 'true');
      if (applied.requiresResponse) params.set('requiresResponse', 'true');
      if (applied.hasActionItems) params.set('hasActionItems', 'true');
      if (applied.isUrgent) params.set('isUrgent', 'true');

      const res = await fetch(`/api/email/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: LogsResponse = await res.json();
        setLogs(data.logs || []);
        setPage(data.page);
        setHasNextPage(data.hasNextPage);
        setTotalPages(data.totalPages);
        setTotalCount(data.totalCount);
      }
    } finally {
      setLogsLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, applied]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser, applied]);

  const handleApplyFilters = () => {
    setApplied({ ...pending });
    setPage(1);
    setSelectedId(null);
  };

  const handleClearFilters = () => {
    setPending(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
    setSelectedId(null);
  };

  const hasPendingChanges = !filtersEqual(pending, applied);
  const hasActive = hasActiveFilter(applied);

  const handlePageChange = (newPage: number) => {
    setSelectedId(null);
    fetchLogs(newPage);
    setPage(newPage);
  };

  const fetchExpandedEmail = useCallback(async (logId: string) => {
    if (!firebaseUser || fetchedExpandedIds.current.has(logId)) return;
    fetchedExpandedIds.current.add(logId);
    setExpandedData((prev) => ({
      ...prev,
      [logId]: { originalBody: null, toAddress: '', ccAddress: null, bccAddress: null, attachmentCount: 0, attachmentNames: [], loading: true },
    }));
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/email/original/${logId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setExpandedData((prev) => ({
          ...prev,
          [logId]: {
            originalBody: data.originalBody ?? null,
            toAddress: data.toAddress || '',
            ccAddress: data.ccAddress ?? null,
            bccAddress: data.bccAddress ?? null,
            attachmentCount: data.attachmentCount ?? 0,
            attachmentNames: data.attachmentNames ?? [],
            loading: false,
          },
        }));
      } else {
        setExpandedData((prev) => ({
          ...prev,
          [logId]: { originalBody: null, toAddress: '', ccAddress: null, bccAddress: null, attachmentCount: 0, attachmentNames: [], loading: false, error: 'Failed to load' },
        }));
      }
    } catch {
      setExpandedData((prev) => ({
        ...prev,
        [logId]: { originalBody: null, toAddress: '', ccAddress: null, bccAddress: null, attachmentCount: 0, attachmentNames: [], loading: false, error: 'Failed to load' },
      }));
    }
  }, [firebaseUser]);

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
    } else {
      setSelectedId(logId);
      setActiveDetailTab('summary');
      fetchExpandedEmail(logId);
    }
  };

  // Auto-expand when selectedEmailId prop is provided (e.g., from push notification link)
  useEffect(() => {
    if (!selectedEmailId) return;
    setSelectedId(selectedEmailId);
    fetchExpandedEmail(selectedEmailId);
  }, [selectedEmailId, fetchExpandedEmail]);

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    fetchLogs(1, true);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  useEffect(() => {
    if (!fullscreenEmailId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreenEmailId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreenEmailId]);

  const fullscreenLog = fullscreenEmailId ? expandedData[fullscreenEmailId] : null;

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <Card>
        <Accordion type="single" collapsible>
          <AccordionItem value="filters" className="border-0">
            <AccordionTrigger className="px-6 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
              {ts.title}
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-6 space-y-4">
                {hasActive && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleClearFilters}
                      className="text-xs text-[#a3891f] dark:text-[#f3df79] hover:underline"
                    >
                      {t.dashboard.emailHistory.clearFilter}
                    </button>
                  </div>
                )}

                {/* Text search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    type="search"
                    value={pending.search}
                    onChange={(e) => setPending((p) => ({ ...p, search: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters(); }}
                    placeholder={ts.searchPlaceholder}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#efd957]/50"
                  />
                </div>

                {/* Dropdown + language filters grid (6 items, 2 cols → 3 cols on sm) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterStatus}</label>
                    <Select
                      value={pending.status || ALL_VALUE}
                      onValueChange={(v) => setPending((p) => ({ ...p, status: v === ALL_VALUE ? '' : v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterSentiment}</label>
                    <Select
                      value={pending.sentiment || ALL_VALUE}
                      onValueChange={(v) => setPending((p) => ({ ...p, sentiment: v === ALL_VALUE ? '' : v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {SENTIMENT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterCategory}</label>
                    <Select
                      value={pending.emailType || ALL_VALUE}
                      onValueChange={(v) => setPending((p) => ({ ...p, emailType: v === ALL_VALUE ? '' : v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {EMAIL_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterPriority}</label>
                    <Select
                      value={pending.priority || ALL_VALUE}
                      onValueChange={(v) => setPending((p) => ({ ...p, priority: v === ALL_VALUE ? '' : v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {PRIORITY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterSenderType}</label>
                    <Select
                      value={pending.senderType || ALL_VALUE}
                      onValueChange={(v) => setPending((p) => ({ ...p, senderType: v === ALL_VALUE ? '' : v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {SENDER_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterLanguage}</label>
                    <input
                      type="text"
                      value={pending.language}
                      onChange={(e) => setPending((p) => ({ ...p, language: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters(); }}
                      placeholder={ts.languagePlaceholder}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#efd957]/50"
                    />
                  </div>
                </div>

                {/* Tags — full row */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{ts.filterTags}</label>
                  <input
                    type="text"
                    value={pending.tags}
                    onChange={(e) => setPending((p) => ({ ...p, tags: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters(); }}
                    placeholder={ts.tagsPlaceholder}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#efd957]/50"
                  />
                </div>

                {/* Toggle filters row */}
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={pending.attachments}
                      onCheckedChange={(v) => setPending((p) => ({ ...p, attachments: v }))}
                      aria-label={ts.withAttachments}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ts.withAttachments}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={pending.requiresResponse}
                      onCheckedChange={(v) => setPending((p) => ({ ...p, requiresResponse: v }))}
                      aria-label={ts.requiresResponse}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ts.requiresResponse}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={pending.hasActionItems}
                      onCheckedChange={(v) => setPending((p) => ({ ...p, hasActionItems: v }))}
                      aria-label={ts.hasActionItems}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ts.hasActionItems}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={pending.isUrgent}
                      onCheckedChange={(v) => setPending((p) => ({ ...p, isUrgent: v }))}
                      aria-label={ts.isUrgent}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ts.isUrgent}</span>
                  </label>
                </div>

                {/* Search button — last row, full width on mobile */}
                <Button
                  size="sm"
                  onClick={handleApplyFilters}
                  disabled={!hasPendingChanges || logsLoading || refreshing}
                  className="w-full sm:w-auto gap-2"
                >
                  <Search className="h-4 w-4 shrink-0" />
                  {ts.applyFilters}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      {/* Active filter chips */}
      {hasActive && (
        <div className="flex flex-wrap gap-2">
          {applied.search && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]">
              &ldquo;{applied.search}&rdquo;
              <button onClick={() => { setPending((p) => ({ ...p, search: '' })); setApplied((a) => ({ ...a, search: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.status && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {ts.filterStatus}: {statusLabel[applied.status] ?? applied.status}
              <button onClick={() => { setPending((p) => ({ ...p, status: '' })); setApplied((a) => ({ ...a, status: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.sentiment && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${SENTIMENT_COLORS[applied.sentiment] ?? DEFAULT_BADGE_COLOR}`}>
              {ts.filterSentiment}: {applied.sentiment}
              <button onClick={() => { setPending((p) => ({ ...p, sentiment: '' })); setApplied((a) => ({ ...a, sentiment: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.emailType && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[applied.emailType] ?? DEFAULT_BADGE_COLOR}`}>
              {ts.filterCategory}: {applied.emailType}
              <button onClick={() => { setPending((p) => ({ ...p, emailType: '' })); setApplied((a) => ({ ...a, emailType: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.priority && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[applied.priority] ?? DEFAULT_BADGE_COLOR}`}>
              {ts.filterPriority}: {applied.priority}
              <button onClick={() => { setPending((p) => ({ ...p, priority: '' })); setApplied((a) => ({ ...a, priority: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.senderType && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {ts.filterSenderType}: {applied.senderType}
              <button onClick={() => { setPending((p) => ({ ...p, senderType: '' })); setApplied((a) => ({ ...a, senderType: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.language && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {ts.filterLanguage}: {applied.language.toUpperCase()}
              <button onClick={() => { setPending((p) => ({ ...p, language: '' })); setApplied((a) => ({ ...a, language: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.tags && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]">
              {ts.filterTags}: {applied.tags}
              <button onClick={() => { setPending((p) => ({ ...p, tags: '' })); setApplied((a) => ({ ...a, tags: '' })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.attachments && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {ts.withAttachments}
              <button onClick={() => { setPending((p) => ({ ...p, attachments: false })); setApplied((a) => ({ ...a, attachments: false })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.requiresResponse && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              {ts.requiresResponse}
              <button onClick={() => { setPending((p) => ({ ...p, requiresResponse: false })); setApplied((a) => ({ ...a, requiresResponse: false })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.hasActionItems && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {ts.hasActionItems}
              <button onClick={() => { setPending((p) => ({ ...p, hasActionItems: false })); setApplied((a) => ({ ...a, hasActionItems: false })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
          {applied.isUrgent && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {ts.isUrgent}
              <button onClick={() => { setPending((p) => ({ ...p, isUrgent: false })); setApplied((a) => ({ ...a, isUrgent: false })); }}><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      {/* Results */}
      <Card>
        <CardHeader className="py-2 px-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {!logsLoading && totalCount !== undefined && (
                <>{totalCount} {t.dashboard.emailHistory.results}</>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchLogs(1, true)}
              disabled={refreshing}
              title={t.dashboard.emailHistory.refresh}
            >
              <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {logsLoading ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-6 py-4 animate-pulse">
                  <div className="flex items-start gap-2">
                    <div className="mt-1 h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                      <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 dark:text-gray-500">
              {hasActive ? (
                <>
                  <p>{ts.noResults}</p>
                  <button
                    onClick={handleClearFilters}
                    className="text-sm mt-2 text-[#a3891f] dark:text-[#f3df79] hover:underline"
                  >
                    {t.dashboard.emailHistory.clearFilter}
                  </button>
                </>
              ) : (
                <>
                  <p>{t.dashboard.emailHistory.noEmailsYet}</p>
                  <p className="text-sm mt-1">{t.dashboard.emailHistory.noEmailsYetDesc}</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log) => {
                  const hasAtt = (log.attachmentCount ?? 0) > 0;
                  const expanded = selectedId === log.id;
                  const emailData = expandedData[log.id];

                  return (
                    <div
                      key={log.id}
                      className={`px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors ${expanded ? 'bg-yellow-50/70 dark:bg-yellow-900/10' : ''}`}
                      onClick={() => handleToggleExpand(log.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                        <div className="min-w-0 flex items-start gap-2">
                          {hasAtt ? (
                            <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" />
                          ) : (
                            <Mail className="h-4 w-4 text-gray-200 dark:text-gray-700 opacity-60 mt-0.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 break-words">{log.subject}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">{t.dashboard.emailHistory.from} {log.fromAddress}</p>
                            {log.emailAnalysis && (
                              <div className="mt-1.5 space-y-1">
                                {/* Row 1: type, sentiment, priority, flags */}
                                <div className="flex flex-wrap gap-1">
                                  {log.emailAnalysis.emailType && (
                                    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${TYPE_COLORS[log.emailAnalysis.emailType] ?? DEFAULT_BADGE_COLOR}`}>
                                      {rowTypeLabel[log.emailAnalysis.emailType] ?? log.emailAnalysis.emailType}
                                    </span>
                                  )}
                                  {log.emailAnalysis.sentiment && (
                                    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${SENTIMENT_COLORS[log.emailAnalysis.sentiment] ?? DEFAULT_BADGE_COLOR}`}>
                                      {rowSentimentLabel[log.emailAnalysis.sentiment] ?? log.emailAnalysis.sentiment}
                                    </span>
                                  )}
                                  {log.emailAnalysis.priority && log.emailAnalysis.priority !== 'normal' && (
                                    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${PRIORITY_COLORS[log.emailAnalysis.priority] ?? DEFAULT_BADGE_COLOR}`}>
                                      {rowPriorityLabel[log.emailAnalysis.priority] ?? log.emailAnalysis.priority}
                                    </span>
                                  )}
                                  {log.emailAnalysis.requiresResponse && (
                                    <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                      {t.dashboard.emailHistory.analysisRequiresResponse}
                                    </span>
                                  )}
                                  {log.emailAnalysis.isUrgent && (
                                    <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                      {ts.isUrgent}
                                    </span>
                                  )}
                                </div>
                                {/* Row 2: tags */}
                                {log.emailAnalysis.tags && log.emailAnalysis.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {log.emailAnalysis.tags.slice(0, 3).map((tag) => (
                                      <span
                                        key={tag}
                                        className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
                          {log.status !== 'forwarded' && (
                            <Badge variant={statusVariant[log.status] || 'default'}>{statusLabel[log.status] ?? log.status}</Badge>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(log.receivedAt, locale)}</span>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 pl-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
                            <TabsList>
                              <TabsTrigger value="summary">{t.dashboard.emailHistory.tabSummary}</TabsTrigger>
                              <TabsTrigger value="content">{t.dashboard.emailHistory.tabContent}</TabsTrigger>
                              <TabsTrigger value="ai">{t.dashboard.emailHistory.tabAiAnalysis}</TabsTrigger>
                            </TabsList>

                            {/* Summary tab: metadata */}
                            <TabsContent value="summary" className="mt-3 space-y-3">
                              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.to}</dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{log.toAddress}</dd>
                                {emailData?.ccAddress && (
                                  <>
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.cc}</dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{emailData.ccAddress}</dd>
                                  </>
                                )}
                                {emailData?.bccAddress && (
                                  <>
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.bcc}</dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">{emailData.bccAddress}</dd>
                                  </>
                                )}
                                <dt className="text-gray-500 dark:text-gray-400 font-medium">{t.dashboard.emailHistory.attachments}</dt>
                                <dd className="text-gray-700 dark:text-gray-300 min-w-0 overflow-hidden">
                                  {emailData?.loading ? (
                                    <span className="text-gray-400">{'\u2026'}</span>
                                  ) : (emailData?.attachmentCount ?? log.attachmentCount ?? 0) > 0 ? (
                                    <ul className="list-none space-y-0.5">
                                      {(emailData?.attachmentNames ?? log.attachmentNames ?? []).map((name, i) => (
                                        <li key={i} className="flex items-center gap-1 min-w-0">
                                          <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
                                          <span className="truncate">{name}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-gray-400">{t.dashboard.emailHistory.noAttachmentsShort}</span>
                                  )}
                                </dd>
                              </dl>

                              {log.ruleApplied && (
                                <p className="text-xs text-gray-600 dark:text-gray-300">
                                  <span className="font-medium">{t.dashboard.emailHistory.ruleApplied}</span> {log.ruleApplied}
                                </p>
                              )}
                              {log.tokensUsed !== undefined && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t.dashboard.emailHistory.tokens} {log.tokensUsed} | {t.dashboard.stats.estCost}: ${(log.estimatedCost || 0).toFixed(5)}
                                </p>
                              )}
                            </TabsContent>

                            {/* Content tab: email iframe */}
                            <TabsContent value="content" className="mt-3 space-y-2">
                              {emailData?.loading && (
                                <div className="animate-pulse space-y-2 pt-1">
                                  <div className="h-[200px] w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
                                  <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                                  <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                                </div>
                              )}
                              {emailData && !emailData.loading && emailData.originalBody && (
                                <>
                                  <iframe
                                    sandbox=""
                                    srcDoc={emailData.originalBody}
                                    className="w-full border-0 rounded-lg"
                                    style={{ minHeight: '200px', maxHeight: '400px' }}
                                    title="Email content preview"
                                    onLoad={(e) => {
                                      const iframe = e.currentTarget;
                                      const height = iframe.contentDocument?.documentElement?.scrollHeight;
                                      if (height) iframe.style.height = `${Math.min(height + 20, 400)}px`;
                                    }}
                                  />
                                  <div className="flex items-center gap-3 pt-1">
                                    {isAdmin ? (
                                      <>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setFullscreenEmailId(log.id); }}
                                          className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                          title={t.emailOriginal.openFullPageView}
                                        >
                                          <i className="bi bi-fullscreen text-[11px]" aria-hidden="true" />
                                          {t.dashboard.emailHistory.viewFullPage}
                                        </button>
                                        <a
                                          href={`/email/original/${log.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 text-xs text-[#d0b53f] hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          {t.dashboard.emailHistory.viewOriginal}
                                        </a>
                                      </>
                                    ) : (
                                      <a
                                        href={`/email/original/${log.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-xs text-[#d0b53f] hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        {t.dashboard.emailHistory.viewOriginal}
                                      </a>
                                    )}
                                  </div>
                                </>
                              )}
                              {emailData && !emailData.loading && !emailData.originalBody && !emailData.error && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                  {t.emailOriginal.noOriginalContent}
                                </p>
                              )}
                            </TabsContent>

                            {/* AI Analysis tab */}
                            <TabsContent value="ai" className="mt-3">
                              {log.emailAnalysis ? (
                                <EmailAnalysisPanel analysis={log.emailAnalysis} />
                              ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                  {t.dashboard.emailHistory.noAiAnalysis}
                                </p>
                              )}
                            </TabsContent>
                          </Tabs>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(hasNextPage || page > 1) && (
                <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 dark:border-gray-800">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1 || refreshing}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t.dashboard.emailHistory.previous}
                  </Button>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {t.dashboard.emailHistory.page} {page}
                    {totalPages !== undefined ? ` ${t.dashboard.emailHistory.of} ${totalPages}` : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={!hasNextPage || refreshing}
                  >
                    {t.dashboard.emailHistory.next}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Fullscreen overlay */}
      {typeof document !== 'undefined' && fullscreenEmailId && fullscreenLog?.originalBody &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-white dark:bg-gray-900 flex flex-col">
            <div className="h-14 shrink-0 px-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-4">
                {logs.find((l) => l.id === fullscreenEmailId)?.subject ?? ''}
              </p>
              <button
                onClick={() => setFullscreenEmailId(null)}
                className="shrink-0 rounded-md p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={t.emailOriginal.closeFullPageView}
                aria-label={t.emailOriginal.closeFullPageView}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <iframe
              sandbox=""
              srcDoc={fullscreenLog.originalBody}
              className="w-full flex-1 border-0"
              title="Original email content full page"
            />
          </div>,
          document.body
        )
      }
    </div>
  );
}
