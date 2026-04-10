'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/Accordion';
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
import { Combobox } from '@/components/ui/Combobox';
import { ComboboxChips } from '@/components/ui/ComboboxChips';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import { formatDate, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { SafeEmailIframe } from '@/components/ui/SafeEmailIframe';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import {
  RefreshCw,
  Mail,
  Paperclip,
  ExternalLink,
  Search,
  X,
  AlignLeft,
  Brain,
  MousePointerClick,
  Trash2,
  Maximize2,
  Eye,
  ChevronDown,
} from 'lucide-react';
import type { EmailAnalysis, EmailAttachmentInfo, EmailLog, LogsResponse } from '@/types';
import type { KnowledgeData } from '@/components/dashboard/KnowledgeTab';
import { EmailAnalysisTabContent } from '@/components/dashboard/EmailAnalysisTabContent';
import { ResultsPagination } from '@/components/dashboard/ResultsPagination';
import { useModalHistory } from '@/hooks/useModalHistory';
import { AttachmentList } from '@/components/dashboard/AttachmentList';
import { Spinner } from '@/components/ui/Spinner';

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
  tags: string[];
  people: string[];
  orgs: string[];
  places: string[];
  events: string[];
  numbers: string[];
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
  tags: [],
  people: [],
  orgs: [],
  places: [],
  events: [],
  numbers: [],
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
    setEq(a.tags, b.tags) &&
    setEq(a.people, b.people) &&
    setEq(a.orgs, b.orgs) &&
    setEq(a.places, b.places) &&
    setEq(a.events, b.events) &&
    setEq(a.numbers, b.numbers) &&
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
    f.tags.length > 0 ||
    f.people.length > 0 ||
    f.orgs.length > 0 ||
    f.places.length > 0 ||
    f.events.length > 0 ||
    f.numbers.length > 0 ||
    f.attachments ||
    f.requiresResponse ||
    f.hasActionItems ||
    f.isUrgent
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ExpandedEmailData {
  originalBody: string | null;
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
// Swipeable row — iOS Mail-style swipe-to-reveal actions.
// Works with mouse, touch and stylus via the Pointer Events API.
// Normal tap/click passes through unchanged; only horizontal drags reveal actions.
// ---------------------------------------------------------------------------
const SWIPE_ACTION_WIDTH = 128; // 64 px per action button × 2
const DRAG_THRESHOLD = 6; // px of movement before we commit to a drag

function SwipeableEmailRow({
  children,
  onOpen,
  onDelete,
}: {
  children: React.ReactNode;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [isSnapped, setIsSnapped] = useState(false);

  // Refs so event handlers never have stale closures
  const liveOffset = useRef(0);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const startOffset = useRef(0);
  const isDragging = useRef(false);
  const suppressNextClick = useRef(false);
  // Set to true by action buttons' onPointerDown so the document close handler skips one event
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

  // When snapped open, close on the next outside pointerdown — but skip
  // if one of the action buttons themselves triggered the pointerdown.
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
    // Let buttons/links handle themselves
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
      // Not enough movement yet — wait
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      // Vertical scroll dominates → cancel horizontal tracking
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerStart.current = null;
        return;
      }
      // Confirmed horizontal drag — capture pointer so scroll doesn't steal it
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

  // Capture-phase click handler:
  //   • after a real drag → suppress the synthetic click that follows pointerup
  //   • when panel is snapped open → close it instead of expanding the row
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
// Main component
// ---------------------------------------------------------------------------
interface EmailSearchTabProps {
  selectedEmailId?: string;
  refreshTrigger?: number;
  knowledgeData?: KnowledgeData | null;
}

export function EmailSearchTab({
  selectedEmailId,
  refreshTrigger,
  knowledgeData,
}: EmailSearchTabProps) {
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
  const [totalEmailCount, setTotalEmailCount] = useState<number | undefined>(undefined);
  const [totalEmailCountLoading, setTotalEmailCountLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(selectedEmailId ?? null);
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedEmailData>>({});
  const [fullscreenEmailId, setFullscreenEmailId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<string>('content');
  const [deleteEmailId, setDeleteEmailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleAnalysisUpdated = useCallback((emailId: string, analysis: EmailAnalysis) => {
    setLogs((prev) =>
      prev.map((log) => (log.id === emailId ? { ...log, emailAnalysis: analysis } : log)),
    );
  }, []);

  // Integrate the fullscreen email dialog with browser history.
  const fullscreenLog = fullscreenEmailId ? expandedData[fullscreenEmailId] : null;
  useModalHistory(!!fullscreenEmailId, () => setFullscreenEmailId(null));

  const fetchedExpandedIds = useRef<Set<string>>(new Set());

  // Pending = staged in UI, not yet applied to the server
  const [pending, setPending] = useState<FilterState>(EMPTY_FILTERS);
  // Applied = currently active server-side filters
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);

  // Advanced filters panel state
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Lazy-loaded entity suggestions
  interface Suggestions {
    tags: SuggestionItem[];
    people: SuggestionItem[];
    organizations: SuggestionItem[];
    places: SuggestionItem[];
    events: SuggestionItem[];
    numbers: SuggestionItem[];
    languages: SuggestionItem[];
  }
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsFetched = useRef(false);

  const fetchSuggestions = useCallback(async () => {
    // Use data already fetched by the parent to avoid a duplicate API call.
    if (knowledgeData !== undefined) {
      if (knowledgeData) {
        setSuggestions({
          tags: knowledgeData.tags ?? [],
          people: knowledgeData.people ?? [],
          organizations: knowledgeData.organizations ?? [],
          places: knowledgeData.places ?? [],
          events: knowledgeData.events ?? [],
          numbers: knowledgeData.numbers ?? [],
          languages: knowledgeData.languages ?? [],
        });
      }
      return;
    }
    if (!firebaseUser || suggestionsFetched.current) return;
    suggestionsFetched.current = true;
    setSuggestionsLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/email/knowledge', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions({
          tags: data.tags ?? [],
          people: data.people ?? [],
          organizations: data.organizations ?? [],
          places: data.places ?? [],
          events: data.events ?? [],
          numbers: data.numbers ?? [],
          languages: data.languages ?? [],
        });
      }
    } finally {
      setSuggestionsLoading(false);
    }
  }, [firebaseUser, knowledgeData]);

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

  const fetchLogs = useCallback(
    async (targetPage: number, isRefresh = false) => {
      if (!firebaseUser) return;
      if (isRefresh) setRefreshing(true);
      else setLogsLoading(true);
      setTotalCount(undefined);
      try {
        const token = await firebaseUser.getIdToken();
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
        applied.tags.forEach((tag) => params.append('tags', tag));
        applied.people.forEach((p) => params.append('people', p));
        applied.orgs.forEach((o) => params.append('orgs', o));
        applied.places.forEach((p) => params.append('places', p));
        applied.events.forEach((e) => params.append('events', e));
        applied.numbers.forEach((n) => params.append('numbers', n));
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
    [firebaseUser, applied],
  );

  const fetchTotalCount = useCallback(async () => {
    if (!firebaseUser) return;
    setTotalEmailCountLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
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
  }, [firebaseUser]);

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [firebaseUser, applied]);

  // Fetch total email count asynchronously when no filters are active.
  useEffect(() => {
    if (!firebaseUser) return;
    setTotalEmailCount(undefined);
    const hasActiveFilters = hasActiveFilter(applied);
    if (!hasActiveFilters) {
      fetchTotalCount();
    }
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

  const handleRefresh = useCallback(() => {
    fetchLogs(1, true);
    if (!hasActive) fetchTotalCount();
  }, [fetchLogs, fetchTotalCount, hasActive]);

  const handlePageChange = (newPage: number) => {
    setSelectedId(null);
    fetchLogs(newPage);
    setPage(newPage);
  };

  const fetchExpandedEmail = useCallback(
    async (logId: string) => {
      if (!firebaseUser || fetchedExpandedIds.current.has(logId)) return;
      fetchedExpandedIds.current.add(logId);
      setExpandedData((prev) => ({
        ...prev,
        [logId]: {
          originalBody: null,
          toAddress: '',
          ccAddress: null,
          bccAddress: null,
          attachmentCount: 0,
          attachmentNames: [],
          attachments: [],
          loading: true,
        },
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
              attachments: data.attachments ?? [],
              loading: false,
            },
          }));
        } else {
          setExpandedData((prev) => ({
            ...prev,
            [logId]: {
              originalBody: null,
              toAddress: '',
              ccAddress: null,
              bccAddress: null,
              attachmentCount: 0,
              attachmentNames: [],
              attachments: [],
              loading: false,
              error: 'Failed to load',
            },
          }));
        }
      } catch {
        setExpandedData((prev) => ({
          ...prev,
          [logId]: {
            originalBody: null,
            toAddress: '',
            ccAddress: null,
            bccAddress: null,
            attachmentCount: 0,
            attachmentNames: [],
            attachments: [],
            loading: false,
            error: 'Failed to load',
          },
        }));
      }
    },
    [firebaseUser],
  );

  const handleToggleExpand = (logId: string) => {
    if (selectedId === logId) {
      setSelectedId(null);
    } else {
      setSelectedId(logId);
      setActiveDetailTab('content');
      fetchExpandedEmail(logId);
    }
  };

  const handleDeleteEmail = useCallback(async () => {
    if (!deleteEmailId || !firebaseUser) return;
    setDeleting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/email/${deleteEmailId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setLogs((prev) => prev.filter((l) => l.id !== deleteEmailId));
        if (selectedId === deleteEmailId) setSelectedId(null);
        if (totalCount !== undefined)
          setTotalCount((c) => (c !== undefined ? Math.max(0, c - 1) : undefined));
        if (totalEmailCount !== undefined)
          setTotalEmailCount((c) => (c !== undefined ? Math.max(0, c - 1) : undefined));
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
  }, [deleteEmailId, firebaseUser, selectedId, t, totalCount, totalEmailCount]);

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
    if (!hasActive) fetchTotalCount();
    setPage(1);
  }, [refreshTrigger]);

  useEffect(() => {
    if (!fullscreenEmailId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenEmailId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreenEmailId]);

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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && hasPendingChanges) handleApplyFilters();
                    }}
                    placeholder={ts.searchPlaceholder}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#efd957]/50"
                  />
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

                      {/* Entity + tag combobox chips — 2-col grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {ts.filterTags}
                          </label>
                          <ComboboxChips
                            options={suggestions ? toChipsOptions(suggestions.tags) : []}
                            values={pending.tags}
                            onValuesChange={(v) => setPending((p) => ({ ...p, tags: v }))}
                            placeholder={ts.tagsPlaceholder}
                            searchPlaceholder={ts.tagsPlaceholder}
                            loading={suggestionsLoading}
                          />
                        </div>

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
          {applied.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#efd957]/20 text-[#a3891f] dark:bg-[#efd957]/10 dark:text-[#f3df79]"
            >
              {ts.filterTags}: {tag}
              <button
                onClick={() => {
                  setPending((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag) }));
                  setApplied((a) => ({ ...a, tags: a.tags.filter((t) => t !== tag) }));
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
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

      {/* Results — NARROW layout (< xl): single column with inline expansion */}
      <div className="min-[900px]:hidden">
        <Card className="hover:translate-y-0 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:hover:shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
          <CardHeader className="py-2 px-4">
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
                      <SwipeableEmailRow
                        key={log.id}
                        onOpen={() => {
                          fetchExpandedEmail(log.id);
                          setFullscreenEmailId(log.id);
                        }}
                        onDelete={() => setDeleteEmailId(log.id)}
                      >
                        <div
                          className={`px-6 py-4 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 cursor-pointer transition-colors ${expanded ? 'bg-yellow-50/70 dark:bg-yellow-900/10' : ''}`}
                          onClick={() => handleToggleExpand(log.id)}
                        >
                          <div className="flex flex-col gap-2">
                            <div className="min-w-0 flex items-start gap-2">
                              {hasAtt ? (
                                <Paperclip className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" />
                              ) : (
                                <Mail className="h-4 w-4 text-gray-200 dark:text-gray-700 opacity-60 mt-0.5 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-100 wrap-break-word">
                                  {log.subject}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-all">
                                  {t.dashboard.emailHistory.from} {log.fromAddress}
                                </p>
                                {log.emailAnalysis && (
                                  <div className="mt-1.5 space-y-1">
                                    {/* Row 1: type, sentiment, priority, flags */}
                                    <div className="flex flex-wrap gap-1">
                                      {log.emailAnalysis.emailType && (
                                        <span
                                          className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${TYPE_COLORS[log.emailAnalysis.emailType] ?? DEFAULT_BADGE_COLOR}`}
                                        >
                                          {rowTypeLabel[log.emailAnalysis.emailType] ??
                                            log.emailAnalysis.emailType}
                                        </span>
                                      )}
                                      {log.emailAnalysis.sentiment && (
                                        <span
                                          className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${SENTIMENT_COLORS[log.emailAnalysis.sentiment] ?? DEFAULT_BADGE_COLOR}`}
                                        >
                                          {rowSentimentLabel[log.emailAnalysis.sentiment] ??
                                            log.emailAnalysis.sentiment}
                                        </span>
                                      )}
                                      {log.emailAnalysis.priority &&
                                        log.emailAnalysis.priority !== 'normal' && (
                                          <span
                                            className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${PRIORITY_COLORS[log.emailAnalysis.priority] ?? DEFAULT_BADGE_COLOR}`}
                                          >
                                            {rowPriorityLabel[log.emailAnalysis.priority] ??
                                              log.emailAnalysis.priority}
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
                                    {log.emailAnalysis.tags &&
                                      log.emailAnalysis.tags.length > 0 && (
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
                            <div className="flex items-center justify-between shrink-0 pl-6">
                              <div className="flex items-center gap-2">
                                {log.status !== 'forwarded' && (
                                  <Badge variant={statusVariant[log.status] || 'default'}>
                                    {log.status === 'processing' && (
                                      <Spinner className="h-3 w-3 mr-1 shrink-0" />
                                    )}
                                    {statusLabel[log.status] ?? log.status}
                                  </Badge>
                                )}
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {formatDate(log.receivedAt, locale)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {expanded && (
                            <div
                              className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 pl-6"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Tabs value={activeDetailTab} onValueChange={setActiveDetailTab}>
                                <TabsList>
                                  <TabsTrigger
                                    value="content"
                                    title={t.dashboard.emailHistory.tabContent}
                                  >
                                    <Mail className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                                    {t.dashboard.emailHistory.tabContent}
                                  </TabsTrigger>
                                  <TabsTrigger value="summary">
                                    <AlignLeft className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                                    {t.dashboard.emailHistory.tabSummary}
                                  </TabsTrigger>
                                  <TabsTrigger value="ai">
                                    <Brain className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                                    {t.dashboard.emailHistory.tabAiAnalysis}
                                  </TabsTrigger>
                                </TabsList>

                                {/* Summary tab: metadata */}
                                <TabsContent value="summary" className="mt-3 space-y-3">
                                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                                    <dt className="text-gray-500 dark:text-gray-400 font-medium">
                                      {t.dashboard.emailHistory.to}
                                    </dt>
                                    <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                                      {log.toAddress}
                                    </dd>
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
                                        <span className="text-gray-400">{'\u2026'}</span>
                                      ) : (emailData?.attachmentCount ?? log.attachmentCount ?? 0) >
                                        0 ? (
                                        <AttachmentList
                                          emailId={log.id}
                                          names={
                                            emailData?.attachmentNames ?? log.attachmentNames ?? []
                                          }
                                          attachments={emailData?.attachments}
                                        />
                                      ) : (
                                        <span className="text-gray-400">
                                          {t.dashboard.emailHistory.noAttachmentsShort}
                                        </span>
                                      )}
                                    </dd>
                                  </dl>

                                  {log.ruleApplied && (
                                    <p className="text-xs text-gray-600 dark:text-gray-300">
                                      <span className="font-medium">
                                        {t.dashboard.emailHistory.ruleApplied}
                                      </span>{' '}
                                      {log.ruleApplied}
                                    </p>
                                  )}
                                  {log.tokensUsed !== undefined && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {t.dashboard.emailHistory.tokens} {log.tokensUsed} |{' '}
                                      {t.dashboard.stats.estCost}: $
                                      {(log.estimatedCost || 0).toFixed(5)}
                                    </p>
                                  )}
                                </TabsContent>

                                {/* Content tab: email iframe */}
                                <TabsContent value="content" className="mt-3 space-y-2">
                                  {emailData?.loading && (
                                    <div className="animate-pulse space-y-2 pt-1">
                                      <div className="h-50 w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
                                      <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                                      <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
                                    </div>
                                  )}
                                  {emailData && !emailData.loading && emailData.originalBody && (
                                    <>
                                      <SafeEmailIframe
                                        html={emailData.originalBody}
                                        className="rounded-lg"
                                        style={{ minHeight: '200px', maxHeight: '400px' }}
                                        maxAutoHeight={400}
                                        // autoResize
                                      />
                                      <div className="flex items-center gap-3 pt-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setFullscreenEmailId(log.id);
                                          }}
                                          className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                                          title={t.emailOriginal.openFullPageView}
                                        >
                                          <i
                                            className="bi bi-fullscreen text-[11px]"
                                            aria-hidden="true"
                                          />
                                          {t.dashboard.emailHistory.viewFullPage}
                                        </button>
                                        {isAdmin && (
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
                                  {emailData &&
                                    !emailData.loading &&
                                    !emailData.originalBody &&
                                    !emailData.error && (
                                      <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                                        {t.emailOriginal.noOriginalContent}
                                      </p>
                                    )}
                                </TabsContent>

                                {/* AI Analysis tab */}
                                <TabsContent value="ai" className="mt-3">
                                  <EmailAnalysisTabContent
                                    emailId={log.id}
                                    analysis={log.emailAnalysis}
                                    onAnalysisUpdated={(analysis) =>
                                      handleAnalysisUpdated(log.id, analysis)
                                    }
                                  />
                                </TabsContent>
                              </Tabs>
                            </div>
                          )}
                        </div>
                      </SwipeableEmailRow>
                    );
                  })}
                </div>

                {(hasNextPage || page > 1) && (
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <ResultsPagination
                      page={page}
                      totalPages={totalPages}
                      hasNextPage={hasNextPage}
                      disabled={refreshing || logsLoading}
                      previousLabel={t.dashboard.emailHistory.previous}
                      nextLabel={t.dashboard.emailHistory.next}
                      onPageChange={handlePageChange}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {/* end narrow layout */}

      {/* Results — WIDE layout (≥ xl): macOS Mail split-pane */}
      <div
        className="hidden min-[900px]:flex glass-panel rounded-2xl border-gray-200 dark:border-gray-700 overflow-y-auto shadow-sm bg-white dark:bg-gray-900 min-h-150"
        style={{ maxHeight: 'calc(100vh - 100px)' }}
      >
        {/* Left pane: list */}
        <div className="w-100 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700">
          {/* Mini results header */}
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
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
          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {logsLoading ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-4 animate-pulse">
                    <div className="flex items-start gap-2">
                      <div className="mt-1 h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
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
              logs.map((log) => {
                const hasAtt = (log.attachmentCount ?? 0) > 0;
                const isSelected = selectedId === log.id;
                return (
                  <div
                    key={log.id}
                    className={cn(
                      'px-4 py-3 cursor-pointer transition-colors border-l-2 group',
                      isSelected
                        ? 'bg-[#efd957]/20 dark:bg-[#efd957]/10 border-l-[#efd957]'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-transparent',
                    )}
                    onClick={() => handleToggleExpand(log.id)}
                  >
                    <div className="flex items-start gap-2">
                      {hasAtt ? (
                        <Paperclip className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                      ) : (
                        <Mail className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-sm truncate',
                            isSelected
                              ? 'font-semibold text-gray-900 dark:text-gray-50'
                              : 'font-medium text-gray-800 dark:text-gray-100',
                          )}
                        >
                          {log.subject}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {log.fromAddress}
                        </p>
                        {log.emailAnalysis && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {log.emailAnalysis.emailType && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${TYPE_COLORS[log.emailAnalysis.emailType] ?? DEFAULT_BADGE_COLOR}`}
                              >
                                {rowTypeLabel[log.emailAnalysis.emailType] ??
                                  log.emailAnalysis.emailType}
                              </span>
                            )}
                            {log.emailAnalysis.sentiment && (
                              <span
                                className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${SENTIMENT_COLORS[log.emailAnalysis.sentiment] ?? DEFAULT_BADGE_COLOR}`}
                              >
                                {rowSentimentLabel[log.emailAnalysis.sentiment] ??
                                  log.emailAnalysis.sentiment}
                              </span>
                            )}
                            {log.emailAnalysis.requiresResponse && (
                              <span className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                {t.dashboard.emailHistory.analysisRequiresResponse}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {log.status !== 'forwarded' && (
                            <Badge
                              variant={statusVariant[log.status] || 'default'}
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              {log.status === 'processing' && (
                                <Spinner className="h-2.5 w-2.5 mr-0.5 shrink-0" />
                              )}
                              {statusLabel[log.status] ?? log.status}
                            </Badge>
                          )}
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {formatDate(log.receivedAt, locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {/* Pagination */}
          {!logsLoading && logs.length > 0 && (hasNextPage || page > 1) && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
              <ResultsPagination
                page={page}
                totalPages={totalPages}
                hasNextPage={hasNextPage}
                disabled={refreshing || logsLoading}
                compact
                previousLabel={t.dashboard.emailHistory.previous}
                nextLabel={t.dashboard.emailHistory.next}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </div>

        {/* Right pane: detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedId && logs.find((l) => l.id === selectedId) ? (
            (() => {
              const log = logs.find((l) => l.id === selectedId)!;
              const emailData = expandedData[selectedId];
              return (
                <>
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {log.subject}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                          {t.dashboard.emailHistory.from} {log.fromAddress}
                        </p>
                      </div>
                      <button
                        onClick={() => setDeleteEmailId(log.id)}
                        className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                        title={t.dashboard.emailHistory.deleteEmail}
                        aria-label={t.dashboard.emailHistory.deleteEmail}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {log.emailAnalysis && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {log.emailAnalysis.emailType && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${TYPE_COLORS[log.emailAnalysis.emailType] ?? DEFAULT_BADGE_COLOR}`}
                          >
                            {rowTypeLabel[log.emailAnalysis.emailType] ??
                              log.emailAnalysis.emailType}
                          </span>
                        )}
                        {log.emailAnalysis.sentiment && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${SENTIMENT_COLORS[log.emailAnalysis.sentiment] ?? DEFAULT_BADGE_COLOR}`}
                          >
                            {rowSentimentLabel[log.emailAnalysis.sentiment] ??
                              log.emailAnalysis.sentiment}
                          </span>
                        )}
                        {log.emailAnalysis.priority && log.emailAnalysis.priority !== 'normal' && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium ${PRIORITY_COLORS[log.emailAnalysis.priority] ?? DEFAULT_BADGE_COLOR}`}
                          >
                            {rowPriorityLabel[log.emailAnalysis.priority] ??
                              log.emailAnalysis.priority}
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
                        {log.emailAnalysis.tags?.slice(0, 4).map((tag) => (
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
                  <div className="flex-1 overflow-hidden flex flex-col px-6 py-4">
                    <Tabs
                      value={activeDetailTab}
                      onValueChange={setActiveDetailTab}
                      className="flex flex-col flex-1 overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <TabsList>
                          <TabsTrigger value="content" title={t.dashboard.emailHistory.tabContent}>
                            <Mail className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                            {t.dashboard.emailHistory.tabContent}
                          </TabsTrigger>
                          <TabsTrigger value="summary">
                            <AlignLeft className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                            {t.dashboard.emailHistory.tabSummary}
                          </TabsTrigger>
                          <TabsTrigger value="ai">
                            <Brain className="h-3.5 w-3.5 shrink-0 mr-1.5" />
                            {t.dashboard.emailHistory.tabAiAnalysis}
                          </TabsTrigger>
                        </TabsList>
                        {activeDetailTab === 'content' &&
                          emailData &&
                          !emailData.loading &&
                          emailData.originalBody && (
                            <div className="flex items-center gap-1 pb-1.5 border-b border-gray-200 dark:border-gray-700">
                              <button
                                onClick={() => setFullscreenEmailId(log.id)}
                                className="p-1.5 rounded text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                title={t.dashboard.emailHistory.viewFullPage}
                                aria-label={t.dashboard.emailHistory.viewFullPage}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                              </button>
                              {isAdmin && (
                                <a
                                  href={`/email/original/${log.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded text-gray-400 hover:text-[#d0b53f] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                  title={t.dashboard.emailHistory.viewOriginal}
                                  aria-label={t.dashboard.emailHistory.viewOriginal}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          )}
                      </div>
                      <TabsContent value="summary" className="mt-3 space-y-3 overflow-y-auto">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                          <dt className="text-gray-500 dark:text-gray-400 font-medium">
                            {t.dashboard.emailHistory.to}
                          </dt>
                          <dd className="text-gray-700 dark:text-gray-300 min-w-0 break-all">
                            {log.toAddress}
                          </dd>
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
                              <span className="text-gray-400">{'…'}</span>
                            ) : (emailData?.attachmentCount ?? log.attachmentCount ?? 0) > 0 ? (
                              <AttachmentList
                                emailId={log.id}
                                names={emailData?.attachmentNames ?? log.attachmentNames ?? []}
                                attachments={emailData?.attachments}
                              />
                            ) : (
                              <span className="text-gray-400">
                                {t.dashboard.emailHistory.noAttachmentsShort}
                              </span>
                            )}
                          </dd>
                        </dl>
                        {log.ruleApplied && (
                          <p className="text-xs text-gray-600 dark:text-gray-300">
                            <span className="font-medium">
                              {t.dashboard.emailHistory.ruleApplied}
                            </span>{' '}
                            {log.ruleApplied}
                          </p>
                        )}
                        {log.tokensUsed !== undefined && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t.dashboard.emailHistory.tokens} {log.tokensUsed} |{' '}
                            {t.dashboard.stats.estCost}: ${(log.estimatedCost || 0).toFixed(5)}
                          </p>
                        )}
                      </TabsContent>
                      <TabsContent
                        value="content"
                        className="flex-1 flex flex-col overflow-hidden mt-3 min-h-0"
                      >
                        {emailData?.loading && (
                          <div className="animate-pulse space-y-2 pt-1">
                            <div className="h-50 w-full bg-gray-200 dark:bg-gray-700 rounded-lg" />
                          </div>
                        )}
                        {emailData && !emailData.loading && emailData.originalBody && (
                          <SafeEmailIframe
                            html={emailData.originalBody}
                            className="flex-1 rounded-lg min-h-0"
                            style={{ height: '100%' }}
                          />
                        )}
                        {emailData &&
                          !emailData.loading &&
                          !emailData.originalBody &&
                          !emailData.error && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
                              {t.emailOriginal.noOriginalContent}
                            </p>
                          )}
                      </TabsContent>
                      <TabsContent value="ai" className="mt-3">
                        <EmailAnalysisTabContent
                          emailId={log.id}
                          analysis={log.emailAnalysis}
                          onAnalysisUpdated={(analysis) => handleAnalysisUpdated(log.id, analysis)}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-600 select-none">
              <MousePointerClick className="h-10 w-10" />
              <p className="text-sm">Select an email to read</p>
            </div>
          )}
        </div>
      </div>

      {/* Full email modal */}
      <FullPageEmailDialog
        open={!!fullscreenEmailId}
        onClose={() => setFullscreenEmailId(null)}
        subject={logs.find((l) => l.id === fullscreenEmailId)?.subject ?? ''}
        body={fullscreenLog?.originalBody ?? null}
        loading={fullscreenLog?.loading}
      />

      {/* Delete confirmation drawer */}
      <Drawer
        open={!!deleteEmailId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteEmailId(null);
          }
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t.dashboard.emailHistory.deleteEmail}</DrawerTitle>
            <DrawerDescription>{t.dashboard.emailHistory.deleteEmailConfirm}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pb-8">
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteEmailId(null);
              }}
              disabled={deleting}
              className="flex-1"
            >
              {t.dashboard.rules.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteEmail}
              disabled={deleting}
              className="flex-1"
            >
              {deleting ? '…' : t.dashboard.emailHistory.deleteEmail}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
