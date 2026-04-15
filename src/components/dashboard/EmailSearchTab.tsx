'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/Accordion';
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
import { Combobox } from '@/components/ui/Combobox';
import { ComboboxChips } from '@/components/ui/ComboboxChips';
import { EmailLogsBrowser } from '@/components/dashboard/EmailLogsBrowser';
import { useEmailExpansion } from '@/hooks/useEmailExpansion';
import { useEmailReadActions } from '@/hooks/useEmailReadActions';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { RefreshCw, Search, X, ChevronDown, Brain } from 'lucide-react';
import { useGlobalModals } from '@/lib/modals';
import type { EmailAnalysis, EmailLog, LogsResponse } from '@/types';
import type { KnowledgeData } from '@/components/dashboard/KnowledgeTab';
import {
  DEFAULT_BADGE_COLOR,
  SENTIMENT_COLORS,
  PRIORITY_COLORS,
  TYPE_COLORS,
} from '@/components/dashboard/EmailListItem';

const PAGE_SIZE = 20;
const PROCESSING_REFRESH_INTERVAL_MS = 30_000;
const ALL_VALUE = '__all__';

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
  people: string[];
  orgs: string[];
  places: string[];
  events: string[];
  dates: string[];
  numbers: string[];
  prices: string[];
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
  people: [],
  orgs: [],
  places: [],
  events: [],
  dates: [],
  numbers: [],
  prices: [],
  attachments: false,
  requiresResponse: false,
  hasActionItems: false,
  isUrgent: false,
};

function filtersEqual(a: FilterState, b: FilterState): boolean {
  /** Set-based comparison: order-independent equality for string arrays. */
  const setEq = (x: string[], y: string[]) => {
    if (x.length !== y.length) return false;
    const sorted = [...x].sort();
    const sortedY = [...y].sort();
    return sorted.every((v, i) => v === sortedY[i]);
  };
  return (
    a.search.trim() === b.search.trim() &&
    a.status === b.status &&
    a.sentiment === b.sentiment &&
    a.emailType === b.emailType &&
    a.priority === b.priority &&
    a.senderType === b.senderType &&
    a.language.trim().toLowerCase() === b.language.trim().toLowerCase() &&
    setEq(a.people, b.people) &&
    setEq(a.orgs, b.orgs) &&
    setEq(a.places, b.places) &&
    setEq(a.events, b.events) &&
    setEq(a.dates, b.dates) &&
    setEq(a.numbers, b.numbers) &&
    setEq(a.prices, b.prices) &&
    a.attachments === b.attachments &&
    a.requiresResponse === b.requiresResponse &&
    a.hasActionItems === b.hasActionItems &&
    a.isUrgent === b.isUrgent
  );
}

function hasActiveFilter(f: FilterState): boolean {
  return (
    !!f.search ||
    !!f.status ||
    !!f.sentiment ||
    !!f.emailType ||
    !!f.priority ||
    !!f.senderType ||
    !!f.language ||
    f.people.length > 0 ||
    f.orgs.length > 0 ||
    f.places.length > 0 ||
    f.events.length > 0 ||
    f.dates.length > 0 ||
    f.numbers.length > 0 ||
    f.prices.length > 0 ||
    f.attachments ||
    f.requiresResponse ||
    f.hasActionItems ||
    f.isUrgent
  );
}

// ---------------------------------------------------------------------------
// Suggestion helpers — defined outside the component to avoid recreation.
// ---------------------------------------------------------------------------
interface SuggestionItem {
  value: string;
  count: number;
}

/** Convert a SuggestionItem array to ComboboxChips options (sorted by count desc, then a-z). */
function toChipsOptions(items: SuggestionItem[]) {
  return [...items]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((item) => ({ value: item.value, label: item.value }));
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  nl: 'Nederlands',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ar: 'العربية',
  ko: '한국어',
  pl: 'Polski',
  sv: 'Svenska',
  da: 'Dansk',
  fi: 'Suomi',
  no: 'Norsk',
  tr: 'Türkçe',
};

/** Convert language suggestions to Combobox options with display names where known. */
function toLanguageOptions(items: SuggestionItem[]) {
  return [...items]
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .map((item) => ({
      value: item.value,
      label: LANGUAGE_NAMES[item.value]
        ? `${LANGUAGE_NAMES[item.value]} (${item.value})`
        : item.value.toUpperCase(),
    }));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface EmailSearchTabProps {
  selectedEmailId?: string;
  refreshTrigger?: number;
  knowledgeData?: KnowledgeData | null;
  onCreditsUsed?: () => void;
}

export function EmailSearchTab({
  selectedEmailId,
  refreshTrigger,
  knowledgeData,
  onCreditsUsed,
}: EmailSearchTabProps) {
  const { t } = useI18n();
  const { authUser, getIdToken } = useAuth();
  const { openAgentFullPage } = useGlobalModals();
  const ts = t.dashboard.search;

  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  const [totalEmailCount, setTotalEmailCount] = useState<number | undefined>(undefined);
  const [totalEmailCountLoading, setTotalEmailCountLoading] = useState(false);
  const hasProcessingEmails = useMemo(() => logs.some((log) => log.status === 'processing'), [logs]);
  const { expandedData, fetchExpandedEmail } = useEmailExpansion();
  const { markEmailAsRead, toggleEmailRead } = useEmailReadActions(setLogs);

  const handleAnalysisUpdated = useCallback((emailId: string, analysis: EmailAnalysis) => {
    setLogs((prev) =>
      prev.map((log) => (log.id === emailId ? { ...log, emailAnalysis: analysis } : log)),
    );
  }, []);

  const suggestionsFetched = useRef(false);

  // Pending = staged in UI, not yet applied to the server
  const [pending, setPending] = useState<FilterState>(EMPTY_FILTERS);
  // Applied = currently active server-side filters
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  // Advanced filters panel state
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Lazy-loaded entity suggestions
  interface Suggestions {
    people: SuggestionItem[];
    organizations: SuggestionItem[];
    places: SuggestionItem[];
    events: SuggestionItem[];
    dates: SuggestionItem[];
    numbers: SuggestionItem[];
    prices: SuggestionItem[];
    languages: SuggestionItem[];
  }
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    // Use data already fetched by the parent to avoid a duplicate API call.
    if (knowledgeData !== undefined) {
      if (knowledgeData) {
        setSuggestions({
          people: knowledgeData.people ?? [],
          organizations: knowledgeData.organizations ?? [],
          places: knowledgeData.places ?? [],
          events: knowledgeData.events ?? [],
          dates: knowledgeData.dates ?? [],
          numbers: knowledgeData.numbers ?? [],
          prices: knowledgeData.prices ?? [],
          languages: knowledgeData.languages ?? [],
        });
      }
      return;
    }
    if (!authUser || suggestionsFetched.current) return;
    suggestionsFetched.current = true;
    setSuggestionsLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/email/knowledge', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions({
          people: data.people ?? [],
          organizations: data.organizations ?? [],
          places: data.places ?? [],
          events: data.events ?? [],
          dates: data.dates ?? [],
          numbers: data.numbers ?? [],
          prices: data.prices ?? [],
          languages: data.languages ?? [],
        });
      }
    } finally {
      setSuggestionsLoading(false);
    }
  }, [authUser, knowledgeData]);

  // Fetch suggestions when advanced section is first opened
  useEffect(() => {
    if (advancedOpen) fetchSuggestions();
  }, [advancedOpen, fetchSuggestions]);

  const statusLabel: Record<string, string> = {
    received: t.dashboard.charts.received,
    processing: t.dashboard.charts.processing,
    forwarded: t.dashboard.charts.forwarded,
    error: t.dashboard.charts.error,
    skipped: t.dashboard.charts.skipped,
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

  const fetchLogs = useCallback(
    async (targetPage: number, isRefresh = false) => {
      if (!authUser) return;
      if (isRefresh) setRefreshing(true);
      else setLogsLoading(true);
      setTotalCount(undefined);
      try {
        const token = await getIdToken();
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (applied.search) params.set('search', applied.search);
        if (applied.status) params.set('status', applied.status);
        if (applied.sentiment) params.set('sentiment', applied.sentiment);
        if (applied.emailType) params.set('emailType', applied.emailType);
        if (applied.priority) params.set('priority', applied.priority);
        if (applied.senderType) params.set('senderType', applied.senderType);
        if (applied.language) params.set('language', applied.language.trim().toLowerCase());
        applied.people.forEach((p) => params.append('people', p));
        applied.orgs.forEach((o) => params.append('orgs', o));
        applied.places.forEach((p) => params.append('places', p));
        applied.events.forEach((e) => params.append('events', e));
        applied.dates.forEach((d) => params.append('dates', d));
        applied.numbers.forEach((n) => params.append('numbers', n));
        applied.prices.forEach((p) => params.append('prices', p));
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
        } else {
          toast.error(t.dashboard.emailHistory.failedToLoad);
        }
      } finally {
        setLogsLoading(false);
        setRefreshing(false);
      }
    },
    [authUser, applied],
  );

  const fetchTotalCount = useCallback(async () => {
    if (!authUser) return;
    setTotalEmailCountLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/email/logs/count', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: { count: number } = await res.json();
        setTotalEmailCount(data.count);
      } else {
        toast.error(t.dashboard.emailHistory.failedToLoadCount);
      }
    } finally {
      setTotalEmailCountLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [authUser, applied]);

  // Fetch total email count asynchronously when no filters are active.
  useEffect(() => {
    if (!authUser) return;
    setTotalEmailCount(undefined);
    const hasActiveFilters = hasActiveFilter(applied);
    if (!hasActiveFilters) {
      fetchTotalCount();
    }
  }, [authUser, applied]);

  const handleApplyFilters = () => {
    setApplied({ ...pending });
    setPage(1);
  };

  const handleClearFilters = () => {
    setPending(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const hasPendingChanges = !filtersEqual(pending, applied);
  const hasActive = hasActiveFilter(applied);

  const handleRefresh = useCallback(() => {
    fetchLogs(1, true);
    if (!hasActive) fetchTotalCount();
  }, [fetchLogs, fetchTotalCount, hasActive]);

  const handlePageChange = (newPage: number) => {
    fetchLogs(newPage);
    setPage(newPage);
  };

  const handleDeleteEmail = useCallback(
    async (emailId: string) => {
      if (!authUser) return;
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/email/${emailId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setLogs((prev) => prev.filter((log) => log.id !== emailId));
          if (totalCount !== undefined)
            setTotalCount((count) => (count !== undefined ? Math.max(0, count - 1) : undefined));
          if (totalEmailCount !== undefined)
            setTotalEmailCount((count) =>
              count !== undefined ? Math.max(0, count - 1) : undefined,
            );
        } else {
          console.error('Failed to delete email:', await res.text());
          toast.error(t.dashboard.emailHistory.deleteEmailError);
        }
      } catch (err) {
        console.error('Failed to delete email:', err);
        toast.error(t.dashboard.emailHistory.deleteEmailError);
      }
    },
    [authUser, getIdToken, t, totalCount, totalEmailCount],
  );

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger === undefined || refreshTrigger === 0) return;
    fetchLogs(1, true);
    if (!hasActive) fetchTotalCount();
    setPage(1);
  }, [refreshTrigger]);

  useEffect(() => {
    if (!authUser) return;
    if (!hasProcessingEmails) return;
    const timer = setInterval(() => {
      void fetchLogs(page, true);
    }, PROCESSING_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authUser, hasProcessingEmails, page, fetchLogs]);

  const selectionResetKey = JSON.stringify(applied);
  const resultsHeader = (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {hasActive ? (
          !logsLoading &&
          totalCount !== undefined && (
            <>
              {totalCount} {t.dashboard.emailHistory.results}
            </>
          )
        ) : totalEmailCountLoading ? (
          <span className="inline-block h-4 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse align-middle" />
        ) : totalEmailCount !== undefined ? (
          <>
            {totalEmailCount} {t.dashboard.emailHistory.messages}
          </>
        ) : null}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleRefresh}
        disabled={refreshing}
        title={t.dashboard.emailHistory.refresh}
      >
        <RefreshCw className={`h-4 w-4${refreshing ? ' animate-spin' : ''}`} />
      </Button>
    </div>
  );
  const resultsEmptyState = (
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
  );

  return (
    <div className="space-y-4">
      {/* Filter panel */}
      <Card>
        <Accordion type="single" collapsible>
          <AccordionItem value="filters" className="border-0">
            <AccordionTrigger className="px-4 py-4 text-base font-semibold text-gray-900 dark:text-gray-100">
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
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                    <input
                      type="search"
                      value={pending.search}
                      onChange={(e) => setPending((p) => ({ ...p, search: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters();
                      }}
                      placeholder={ts.searchPlaceholder}
                      className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-inset focus:ring-1 focus:ring-[#efd957] focus:border-[#efd957]"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openAgentFullPage}
                    className="shrink-0 gap-1.5 hover:translate-y-0"
                    title={ts.askAI}
                  >
                    <Brain className="h-4 w-4" />
                    {ts.askAI}
                  </Button>
                </div>

                {/* Advanced filters — collapsible sub-section */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <span>{ts.advancedFilters}</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        advancedOpen ? 'rotate-180' : '',
                      )}
                    />
                  </button>

                  {advancedOpen && (
                    <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-200 dark:border-gray-700">
                      {/* Dropdown filters grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterStatus}
                          </label>
                          <Select
                            value={pending.status || ALL_VALUE}
                            onValueChange={(v) =>
                              setPending((p) => ({ ...p, status: v === ALL_VALUE ? '' : v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {STATUS_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterSentiment}
                          </label>
                          <Select
                            value={pending.sentiment || ALL_VALUE}
                            onValueChange={(v) =>
                              setPending((p) => ({ ...p, sentiment: v === ALL_VALUE ? '' : v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {SENTIMENT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterCategory}
                          </label>
                          <Select
                            value={pending.emailType || ALL_VALUE}
                            onValueChange={(v) =>
                              setPending((p) => ({ ...p, emailType: v === ALL_VALUE ? '' : v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {EMAIL_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterPriority}
                          </label>
                          <Select
                            value={pending.priority || ALL_VALUE}
                            onValueChange={(v) =>
                              setPending((p) => ({ ...p, priority: v === ALL_VALUE ? '' : v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {PRIORITY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterSenderType}
                          </label>
                          <Select
                            value={pending.senderType || ALL_VALUE}
                            onValueChange={(v) =>
                              setPending((p) => ({ ...p, senderType: v === ALL_VALUE ? '' : v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {SENDER_TYPE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterLanguage}
                          </label>
                          <Combobox
                            options={suggestions ? toLanguageOptions(suggestions.languages) : []}
                            value={pending.language}
                            onValueChange={(v) => setPending((p) => ({ ...p, language: v }))}
                            placeholder={ts.languagePlaceholder}
                            searchPlaceholder={ts.languagePlaceholder}
                            clearable
                            disabled={suggestionsLoading}
                          />
                        </div>
                      </div>

                      {/* Entity combobox chips — 2-col grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterPeople}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.people) : []}
                            values={pending.people}
                            onValuesChange={(v) => setPending((p) => ({ ...p, people: v }))}
                            placeholder={ts.peoplePlaceholder}
                            searchPlaceholder={ts.peoplePlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterOrgs}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.organizations) : []}
                            values={pending.orgs}
                            onValuesChange={(v) => setPending((p) => ({ ...p, orgs: v }))}
                            placeholder={ts.orgsPlaceholder}
                            searchPlaceholder={ts.orgsPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterPlaces}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.places) : []}
                            values={pending.places}
                            onValuesChange={(v) => setPending((p) => ({ ...p, places: v }))}
                            placeholder={ts.placesPlaceholder}
                            searchPlaceholder={ts.placesPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterEvents}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.events) : []}
                            values={pending.events}
                            onValuesChange={(v) => setPending((p) => ({ ...p, events: v }))}
                            placeholder={ts.eventsPlaceholder}
                            searchPlaceholder={ts.eventsPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterDates}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.dates) : []}
                            values={pending.dates}
                            onValuesChange={(v) => setPending((p) => ({ ...p, dates: v }))}
                            placeholder={ts.datesPlaceholder}
                            searchPlaceholder={ts.datesPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterNumbers}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.numbers) : []}
                            values={pending.numbers}
                            onValuesChange={(v) => setPending((p) => ({ ...p, numbers: v }))}
                            placeholder={ts.numbersPlaceholder}
                            searchPlaceholder={ts.numbersPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterPrices}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.prices) : []}
                            values={pending.prices}
                            onValuesChange={(v) => setPending((p) => ({ ...p, prices: v }))}
                            placeholder={ts.pricesPlaceholder}
                            searchPlaceholder={ts.pricesPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>
                      </div>

                      {/* Toggle filters row */}
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={pending.attachments}
                            onCheckedChange={(v) => setPending((p) => ({ ...p, attachments: v }))}
                            aria-label={ts.withAttachments}
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {ts.withAttachments}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={pending.requiresResponse}
                            onCheckedChange={(v) =>
                              setPending((p) => ({ ...p, requiresResponse: v }))
                            }
                            aria-label={ts.requiresResponse}
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {ts.requiresResponse}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={pending.hasActionItems}
                            onCheckedChange={(v) =>
                              setPending((p) => ({ ...p, hasActionItems: v }))
                            }
                            aria-label={ts.hasActionItems}
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {ts.hasActionItems}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Switch
                            checked={pending.isUrgent}
                            onCheckedChange={(v) => setPending((p) => ({ ...p, isUrgent: v }))}
                            aria-label={ts.isUrgent}
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {ts.isUrgent}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
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
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, search: '' }));
                  setApplied((a) => ({ ...a, search: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.status && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {ts.filterStatus}: {statusLabel[applied.status] ?? applied.status}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, status: '' }));
                  setApplied((a) => ({ ...a, status: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.sentiment && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${SENTIMENT_COLORS[applied.sentiment] ?? DEFAULT_BADGE_COLOR}`}
            >
              {ts.filterSentiment}: {applied.sentiment}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, sentiment: '' }));
                  setApplied((a) => ({ ...a, sentiment: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.emailType && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[applied.emailType] ?? DEFAULT_BADGE_COLOR}`}
            >
              {ts.filterCategory}: {applied.emailType}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, emailType: '' }));
                  setApplied((a) => ({ ...a, emailType: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.priority && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[applied.priority] ?? DEFAULT_BADGE_COLOR}`}
            >
              {ts.filterPriority}: {applied.priority}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, priority: '' }));
                  setApplied((a) => ({ ...a, priority: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.senderType && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {ts.filterSenderType}: {applied.senderType}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, senderType: '' }));
                  setApplied((a) => ({ ...a, senderType: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.language && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {ts.filterLanguage}: {applied.language.toUpperCase()}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, language: '' }));
                  setApplied((a) => ({ ...a, language: '' }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.people.map((person) => (
            <span
              key={person}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            >
              {ts.filterPeople}: {person}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, people: p.people.filter((v) => v !== person) }));
                  setApplied((a) => ({ ...a, people: a.people.filter((v) => v !== person) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.orgs.map((org) => (
            <span
              key={org}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            >
              {ts.filterOrgs}: {org}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, orgs: p.orgs.filter((v) => v !== org) }));
                  setApplied((a) => ({ ...a, orgs: a.orgs.filter((v) => v !== org) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.places.map((place) => (
            <span
              key={place}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            >
              {ts.filterPlaces}: {place}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, places: p.places.filter((v) => v !== place) }));
                  setApplied((a) => ({ ...a, places: a.places.filter((v) => v !== place) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.events.map((event) => (
            <span
              key={event}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
            >
              {ts.filterEvents}: {event}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, events: p.events.filter((v) => v !== event) }));
                  setApplied((a) => ({ ...a, events: a.events.filter((v) => v !== event) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.dates.map((date) => (
            <span
              key={date}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
            >
              {ts.filterDates}: {date}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, dates: p.dates.filter((v) => v !== date) }));
                  setApplied((a) => ({ ...a, dates: a.dates.filter((v) => v !== date) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.numbers.map((num) => (
            <span
              key={num}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            >
              {ts.filterNumbers}: {num}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, numbers: p.numbers.filter((v) => v !== num) }));
                  setApplied((a) => ({ ...a, numbers: a.numbers.filter((v) => v !== num) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.prices.map((price) => (
            <span
              key={price}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            >
              {ts.filterPrices}: {price}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, prices: p.prices.filter((v) => v !== price) }));
                  setApplied((a) => ({ ...a, prices: a.prices.filter((v) => v !== price) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {applied.attachments && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {ts.withAttachments}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, attachments: false }));
                  setApplied((a) => ({ ...a, attachments: false }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.requiresResponse && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              {ts.requiresResponse}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, requiresResponse: false }));
                  setApplied((a) => ({ ...a, requiresResponse: false }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.hasActionItems && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {ts.hasActionItems}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, hasActionItems: false }));
                  setApplied((a) => ({ ...a, hasActionItems: false }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {applied.isUrgent && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {ts.isUrgent}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, isUrgent: false }));
                  setApplied((a) => ({ ...a, isUrgent: false }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}

      <EmailLogsBrowser
        header={resultsHeader}
        emptyState={resultsEmptyState}
        logs={logs}
        logsLoading={logsLoading}
        page={page}
        totalPages={totalPages}
        hasNextPage={hasNextPage}
        onPageChange={handlePageChange}
        paginationDisabled={refreshing}
        expandedData={expandedData}
        fetchExpandedEmail={fetchExpandedEmail}
        markEmailAsRead={markEmailAsRead}
        onToggleRead={toggleEmailRead}
        onDeleteEmail={handleDeleteEmail}
        onAnalysisUpdated={handleAnalysisUpdated}
        onCreditsUsed={onCreditsUsed}
        selectedEmailId={selectedEmailId}
        selectionResetKey={selectionResetKey}
      />
    </div>
  );
}
