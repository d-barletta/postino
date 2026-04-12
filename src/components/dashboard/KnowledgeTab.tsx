'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Sparkles,
  Hash,
  Users,
  Building2,
  MapPin,
  Calendar,
  Clock,
  Search,
  X,
  GitMerge,
  Trash2,
  Wand2,
  CheckCircle,
  XCircle,
  Binary,
  DollarSign,
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/Drawer';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import { EntityMergeDialog } from '@/components/dashboard/EntityMergeDialog';
import { useModalHistory } from '@/hooks/useModalHistory';
import type { EntityMerge, EntityMergeSuggestion, EntityCategory } from '@/types';

export interface KnowledgeItem {
  value: string;
  count: number;
}

export interface KnowledgeData {
  people: KnowledgeItem[];
  organizations: KnowledgeItem[];
  places: KnowledgeItem[];
  events: KnowledgeItem[];
  dates: KnowledgeItem[];
  topics: KnowledgeItem[];
  numbers: KnowledgeItem[];
  prices: KnowledgeItem[];
  languages?: KnowledgeItem[];
  totalEmails: number;
}

type CategoryKey =
  | 'all'
  | 'people'
  | 'organizations'
  | 'places'
  | 'events'
  | 'dates'
  | 'topics'
  | 'numbers'
  | 'prices';

interface CategoryConfig {
  key: CategoryKey;
  icon: React.ReactNode;
  dataKey?: keyof Omit<KnowledgeData, 'totalEmails'>;
}

const CATEGORIES: CategoryConfig[] = [
  { key: 'all', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: 'people', icon: <Users className="h-3.5 w-3.5" />, dataKey: 'people' },
  { key: 'organizations', icon: <Building2 className="h-3.5 w-3.5" />, dataKey: 'organizations' },
  { key: 'places', icon: <MapPin className="h-3.5 w-3.5" />, dataKey: 'places' },
  { key: 'events', icon: <Calendar className="h-3.5 w-3.5" />, dataKey: 'events' },
  { key: 'dates', icon: <Clock className="h-3.5 w-3.5" />, dataKey: 'dates' },
  { key: 'numbers', icon: <Binary className="h-3.5 w-3.5" />, dataKey: 'numbers' },
  { key: 'prices', icon: <DollarSign className="h-3.5 w-3.5" />, dataKey: 'prices' },
  { key: 'topics', icon: <Hash className="h-3.5 w-3.5" />, dataKey: 'topics' },
];

const SECTION_ICONS: Record<string, React.ReactNode> = {
  people: <Users className="h-4 w-4" />,
  organizations: <Building2 className="h-4 w-4" />,
  places: <MapPin className="h-4 w-4" />,
  events: <Calendar className="h-4 w-4" />,
  dates: <Clock className="h-4 w-4" />,
  topics: <Hash className="h-4 w-4" />,
  numbers: <Binary className="h-4 w-4" />,
  prices: <DollarSign className="h-4 w-4" />,
};

function getFrequencyClass(count: number, maxCount: number): string {
  if (maxCount === 0) return '';
  const ratio = count / maxCount;
  if (ratio >= 0.75) return 'text-base font-semibold px-3 py-1.5';
  if (ratio >= 0.5) return 'text-sm font-medium px-2.5 py-1';
  if (ratio >= 0.25) return 'text-sm px-2.5 py-1';
  return 'text-xs px-2 py-0.5';
}

function SkeletonChips() {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="h-7 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"
          style={{ width: `${60 + (i % 5) * 20}px` }}
        />
      ))}
    </div>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#efd957] text-[#a3891f] rounded-sm px-0 not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

interface ChipProps {
  item: KnowledgeItem;
  maxCount: number;
  detailed?: boolean;
  highlight?: string;
  mergeMode: boolean;
  selected: boolean;
  isMerged?: boolean;
  onClick: () => void;
}

function Chip({
  item,
  maxCount,
  detailed = false,
  highlight = '',
  mergeMode,
  selected,
  isMerged = false,
  onClick,
}: ChipProps) {
  const freqClass = detailed ? getFrequencyClass(item.count, maxCount) : 'text-xs px-2 py-0.5';
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#efd957]',
        freqClass,
        mergeMode && selected
          ? 'border-[#efd957] bg-[#efd957]/20 text-[#a3891f] dark:text-[#efd957] ring-2 ring-[#efd957]/40'
          : mergeMode
            ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-[#efd957]/60 cursor-pointer'
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-[#efd957] hover:bg-[#efd957]/10 hover:text-[#a3891f] dark:hover:text-[#efd957]',
      )}
    >
      {mergeMode && (
        <span
          className={cn(
            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-[#a3891f] bg-[#efd957]' : 'border-gray-400 dark:border-gray-500',
          )}
        />
      )}
      {isMerged && !mergeMode && (
        <GitMerge className="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500" />
      )}
      <span className={cn('truncate max-w-45', isMerged && 'font-semibold')}>
        <HighlightedText text={item.value} query={highlight} />
      </span>
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 h-4 shrink-0 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
      >
        {item.count}
      </Badge>
    </button>
  );
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  items: KnowledgeItem[];
  category: string;
  highlight?: string;
  mergeMode: boolean;
  selectedKeys: Set<string>;
  mergedCanonicals: Set<string>;
  onChipClick: (value: string, category: string) => void;
}

function Section({
  title,
  icon,
  items,
  category,
  highlight = '',
  mergeMode,
  selectedKeys,
  mergedCanonicals,
  onChipClick,
}: SectionProps) {
  const filtered = highlight
    ? items.filter((i) => i.value.toLowerCase().includes(highlight.toLowerCase()))
    : items;
  if (filtered.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((item) => (
          <Chip
            key={item.value}
            item={item}
            maxCount={items[0]?.count ?? 1}
            highlight={highlight}
            mergeMode={mergeMode}
            selected={selectedKeys.has(`${category}:${item.value}`)}
            isMerged={mergedCanonicals.has(`${category}:${item.value}`)}
            onClick={() => onChipClick(item.value, category)}
          />
        ))}
      </div>
    </div>
  );
}

interface SelectedChip {
  value: string;
  category: EntityCategory;
}

interface KnowledgeTabProps {
  knowledgeData: KnowledgeData | null;
  knowledgeLoading: boolean;
  knowledgeError: string | null;
  onRefreshKnowledge: () => Promise<void>;
}

export function KnowledgeTab({
  knowledgeData: data,
  knowledgeLoading: loading,
  knowledgeError: error,
  onRefreshKnowledge,
}: KnowledgeTabProps) {
  const { t } = useI18n();
  const { authUser, getIdToken } = useAuth();
  const k = t.dashboard.knowledge;
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalChip, setModalChip] = useState<{
    value: string;
    category: string;
    label: string;
    aliases?: string[];
  } | null>(null);
  const [fullscreenEmail, setFullscreenEmail] = useState<{ subject: string; body: string } | null>(
    null,
  );
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Entity merges
  const [merges, setMerges] = useState<EntityMerge[]>([]);
  const [mergesLoading, setMergesLoading] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedChips, setSelectedChips] = useState<SelectedChip[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [exploreSubTab, setExploreSubTab] = useState<'list' | 'merged' | 'suggestions'>('list');
  const [pendingDeleteMerge, setPendingDeleteMerge] = useState<EntityMerge | null>(null);
  const [deletingMerge, setDeletingMerge] = useState(false);

  // AI merge suggestions
  const [suggestions, setSuggestions] = useState<EntityMergeSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [pendingAcceptSuggestion, setPendingAcceptSuggestion] =
    useState<EntityMergeSuggestion | null>(null);

  // Integrate the fullscreen email dialog with browser history.
  useModalHistory(!!fullscreenEmail, () => setFullscreenEmail(null));

  const fetchMerges = useCallback(async () => {
    if (!authUser) return;
    setMergesLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/merges', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { merges: EntityMerge[] };
        setMerges(json.merges ?? []);
      } else {
        toast.error(k.failedToLoadMerges);
      }
    } finally {
      setMergesLoading(false);
    }
  }, [authUser]);

  const fetchSuggestions = useCallback(async () => {
    if (!authUser) return;
    setSuggestionsLoading(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/merge-suggestions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { suggestions: EntityMergeSuggestion[] };
        setSuggestions(json.suggestions ?? []);
      } else {
        toast.error(k.failedToLoadSuggestions);
      }
    } finally {
      setSuggestionsLoading(false);
    }
  }, [authUser]);

  const generateSuggestions = useCallback(async () => {
    if (!authUser) return;
    setGeneratingSuggestions(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/entities/merge-suggestions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 409) {
        toast.error(k.suggestionsCompleteFirst);
        return;
      }
      if (!res.ok) {
        toast.error(k.suggestionsError);
        return;
      }
      const json = (await res.json()) as { suggestions: EntityMergeSuggestion[] };
      setSuggestions(json.suggestions ?? []);
      toast.success(k.suggestionsGenerated);
    } catch {
      toast.error(k.suggestionsError);
    } finally {
      setGeneratingSuggestions(false);
    }
  }, [authUser, k]);

  const handleRejectSuggestion = useCallback(
    async (id: string) => {
      if (!authUser) return;
      try {
        const token = await getIdToken();
        const res = await fetch(`/api/entities/merge-suggestions/${id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'rejected' }),
        });
        if (res.ok) {
          setSuggestions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status: 'rejected' } : s)),
          );
        }
      } catch {
        // silently ignore
      }
    },
    [authUser],
  );

  const handleAcceptSuggestion = useCallback(
    async (canonical: string, aliases: string[], category: EntityCategory) => {
      if (!pendingAcceptSuggestion || !authUser) return;
      const token = await getIdToken();
      const res = await fetch('/api/entities/merges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ canonical, aliases, category }),
      });

      if (res.status === 409) {
        const json = (await res.json()) as { existingId?: string; error?: string };
        const existingId = json.existingId;
        if (!existingId) throw new Error(json.error ?? 'Failed to create merge');

        const existingMerge = merges.find((m) => m.id === existingId);
        const mergedAliases = existingMerge
          ? Array.from(new Set([...existingMerge.aliases, ...aliases]))
          : aliases;

        const patchRes = await fetch(`/api/entities/merges/${existingId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ canonical, aliases: mergedAliases, category }),
        });
        if (!patchRes.ok) {
          const patchJson = (await patchRes.json()) as { error?: string };
          throw new Error(patchJson.error ?? 'Failed to update merge');
        }
      } else if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Failed to create merge');
      }

      // Mark suggestion as accepted
      const suggestionId = pendingAcceptSuggestion.id;
      try {
        const pToken = await getIdToken();
        await fetch(`/api/entities/merge-suggestions/${suggestionId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${pToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'accepted' }),
        });
        setSuggestions((prev) =>
          prev.map((s) => (s.id === suggestionId ? { ...s, status: 'accepted' } : s)),
        );
      } catch {
        // silently ignore
      }

      await Promise.all([onRefreshKnowledge(), fetchMerges()]);
      toast.success(k.mergeCreated);
    },
    [authUser, merges, pendingAcceptSuggestion, onRefreshKnowledge, fetchMerges, k],
  );

  useEffect(() => {
    fetchMerges();
    fetchSuggestions();
  }, [fetchMerges, fetchSuggestions]);

  /** Set of "category:canonical" for merged entities (to show the merge icon). */
  const mergedCanonicals = useMemo(
    () => new Set(merges.map((m) => `${m.category}:${m.canonical}`)),
    [merges],
  );

  /** Map from "category:canonical" → aliases for ExploreEmailsModal. */
  const mergeAliasMap = useMemo(
    () => new Map<string, string[]>(merges.map((m) => [`${m.category}:${m.canonical}`, m.aliases])),
    [merges],
  );

  const categoryLabel = (key: CategoryKey): string => {
    if (key === 'all') return k.allCategories;
    return k[key];
  };

  const toggleMergeMode = useCallback(() => {
    setMergeMode((prev) => {
      if (prev) setSelectedChips([]);
      else setExploreSubTab('list');
      return !prev;
    });
  }, []);

  const handleChipClick = useCallback(
    (value: string, category: string) => {
      if (mergeMode) {
        const key = `${category}:${value}`;
        setSelectedChips((prev) => {
          const exists = prev.some((c) => `${c.category}:${c.value}` === key);
          if (exists) return prev.filter((c) => `${c.category}:${c.value}` !== key);
          return [...prev, { value, category: category as EntityCategory }];
        });
        return;
      }
      const catKey = category as CategoryKey;
      const label = catKey === 'all' ? k.allCategories : (k[catKey] ?? category);
      const mergeKey = `${category}:${value}`;
      const aliases = mergeAliasMap.get(mergeKey);
      setModalChip({ value, category, label, aliases });
    },
    [mergeMode, k, mergeAliasMap],
  );

  /** True when all selected chips share the same category and there are at least 2. */
  const canMergeSelected =
    selectedChips.length >= 2 && new Set(selectedChips.map((c) => c.category)).size === 1;

  const handleCreateMerge = useCallback(
    async (canonical: string, aliases: string[], category: EntityCategory) => {
      if (!authUser) return;
      const token = await getIdToken();
      const res = await fetch('/api/entities/merges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ canonical, aliases, category }),
      });

      if (res.status === 409) {
        // Some aliases already belong to an existing merge — update it with the union
        const json = (await res.json()) as { existingId?: string; error?: string };
        const existingId = json.existingId;
        if (!existingId) throw new Error(json.error ?? 'Failed to create merge');

        const existingMerge = merges.find((m) => m.id === existingId);
        const mergedAliases = existingMerge
          ? Array.from(new Set([...existingMerge.aliases, ...aliases]))
          : aliases;

        const patchRes = await fetch(`/api/entities/merges/${existingId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ canonical, aliases: mergedAliases, category }),
        });
        if (!patchRes.ok) {
          const patchJson = (await patchRes.json()) as { error?: string };
          throw new Error(patchJson.error ?? 'Failed to update merge');
        }
        await Promise.all([onRefreshKnowledge(), fetchMerges()]);
        setMergeMode(false);
        setSelectedChips([]);
        toast.success(k.mergeCreated);
        return;
      }

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? 'Failed to create merge');
      }
      await Promise.all([onRefreshKnowledge(), fetchMerges()]);
      setMergeMode(false);
      setSelectedChips([]);
      toast.success(k.mergeCreated);
    },
    [authUser, onRefreshKnowledge, fetchMerges, merges, k],
  );

  const handleDeleteMerge = useCallback(async () => {
    if (!authUser || !pendingDeleteMerge) return;
    setDeletingMerge(true);
    try {
      const token = await getIdToken();
      await fetch(`/api/entities/merges/${pendingDeleteMerge.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      await Promise.all([onRefreshKnowledge(), fetchMerges()]);
      toast.success(k.mergeDeleted);
    } finally {
      setDeletingMerge(false);
      setPendingDeleteMerge(null);
    }
  }, [authUser, pendingDeleteMerge, onRefreshKnowledge, fetchMerges, k]);

  const hasAnyData =
    data &&
    (data.topics.length > 0 ||
      data.people.length > 0 ||
      data.organizations.length > 0 ||
      data.places.length > 0 ||
      data.events.length > 0 ||
      data.dates.length > 0 ||
      data.numbers.length > 0 ||
      data.prices.length > 0);

  const activeCategoryConfig = CATEGORIES.find((c) => c.key === activeCategory);
  const activeItems: KnowledgeItem[] =
    activeCategory === 'all' || !activeCategoryConfig?.dataKey
      ? []
      : (data?.[activeCategoryConfig.dataKey] ?? []);
  const activeMaxCount = activeItems[0]?.count ?? 1;

  const selectedCategory = selectedChips[0]?.category ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{k.title}</h2>
            {/* {data && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {k.emailsAnalyzed.replace('{count}', String(data.totalEmails))}
              </p>
            )} */}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasAnyData}
              onClick={toggleMergeMode}
              aria-label={mergeMode ? k.cancelMerge : k.merge}
              className={cn(mergeMode && 'text-[#a3891f] dark:text-[#efd957]')}
            >
              <GitMerge className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onRefreshKnowledge();
                fetchMerges();
              }}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{k.subtitle}</p>
      </CardHeader>

      {/* Sticky merge mode status bar (visible while scrolling through chips) */}
      {mergeMode && (
        <div className="sticky top-16 z-10 flex flex-col gap-1.5 min-[800px]:flex-row min-[800px]:items-center min-[800px]:justify-between border-b border-[#efd957]/40 bg-[#fffbeb] dark:bg-[#1c1500] px-4 py-2 text-sm text-[#a3891f] dark:text-[#efd957]">
          {/* Status + warning (truncated) */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-xs">
              {selectedChips.length > 0
                ? k.xSelected.replace('{count}', String(selectedChips.length))
                : k.mergeMode}
            </span>
            {selectedChips.length >= 2 && !canMergeSelected && (
              <span className="text-xs text-red-500 dark:text-red-400 truncate min-w-0">
                {k.mergeSameCategoryWarning}
              </span>
            )}
          </div>
          {/* Action buttons on same row at ≥800px, own row below */}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleMergeMode}>
              {k.cancelMerge}
            </Button>
            <Button
              size="sm"
              disabled={!canMergeSelected}
              onClick={() => setShowMergeDialog(true)}
              className="h-7 text-xs bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
            >
              {k.mergeSelected}
            </Button>
          </div>
        </div>
      )}

      <CardContent className="space-y-0 p-2">
        <Tabs
          value={exploreSubTab}
          onValueChange={(v) => setExploreSubTab(v as 'list' | 'merged' | 'suggestions')}
        >
          <TabsList>
            <TabsTrigger value="list" className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {k.listTab}
            </TabsTrigger>
            <TabsTrigger
              value="merged"
              disabled={mergeMode}
              className="inline-flex items-center gap-1.5"
            >
              <GitMerge className="h-3.5 w-3.5" />
              {k.mergedTab}
            </TabsTrigger>
            <TabsTrigger
              value="suggestions"
              disabled={mergeMode}
              className="inline-flex items-center gap-1.5"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {k.suggestionsTab}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-5">
            {/* Category filter pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium shrink-0 transition-all',
                    'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#efd957]',
                    activeCategory === cat.key
                      ? 'bg-[#efd957] border-[#efd957] text-black shadow-sm'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-[#efd957]/60',
                  )}
                >
                  {cat.icon}
                  {categoryLabel(cat.key)}
                </button>
              ))}
            </div>

            {/* Text search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter tags…"
                className={cn(
                  'flex h-8 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent pl-8 pr-8 py-1 text-sm shadow-sm',
                  'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#efd957] focus-visible:border-[#efd957]',
                  'dark:bg-gray-800 dark:text-gray-100',
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Content area */}
            {loading && (
              <div className="space-y-4">
                <SkeletonChips />
              </div>
            )}

            {!loading && error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

            {!loading && !error && !hasAnyData && data !== null && (
              <div className="text-center py-12">
                <Sparkles className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-base font-medium text-gray-600 dark:text-gray-400">{k.noData}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
                  {k.noDataDesc}
                </p>
              </div>
            )}

            {!loading && !error && hasAnyData && activeCategory === 'all' && (
              <div className="space-y-5">
                {(
                  [
                    'people',
                    'organizations',
                    'places',
                    'events',
                    'dates',
                    'numbers',
                    'prices',
                    'topics',
                  ] as const
                ).map((key) => (
                  <Section
                    key={key}
                    title={k[key]}
                    icon={SECTION_ICONS[key]}
                    items={data?.[key] ?? []}
                    category={key}
                    highlight={searchQuery}
                    mergeMode={mergeMode}
                    selectedKeys={new Set(selectedChips.map((c) => `${c.category}:${c.value}`))}
                    mergedCanonicals={mergedCanonicals}
                    onChipClick={handleChipClick}
                  />
                ))}
              </div>
            )}

            {!loading &&
              !error &&
              hasAnyData &&
              activeCategory !== 'all' &&
              (() => {
                const filtered = searchQuery
                  ? activeItems.filter((i) =>
                      i.value.toLowerCase().includes(searchQuery.toLowerCase()),
                    )
                  : activeItems;
                const selectedSet = new Set(selectedChips.map((c) => `${c.category}:${c.value}`));
                return (
                  <div className="flex flex-wrap gap-2">
                    {filtered.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500">{k.noData}</p>
                    ) : (
                      filtered.map((item) => (
                        <Chip
                          key={item.value}
                          item={item}
                          maxCount={activeMaxCount}
                          detailed
                          highlight={searchQuery}
                          mergeMode={mergeMode}
                          selected={selectedSet.has(`${activeCategory}:${item.value}`)}
                          isMerged={mergedCanonicals.has(`${activeCategory}:${item.value}`)}
                          onClick={() => handleChipClick(item.value, activeCategory)}
                        />
                      ))
                    )}
                  </div>
                );
              })()}
          </TabsContent>

          <TabsContent value="merged" className="pb-2">
            {mergesLoading ? (
              <div className="py-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
                  />
                ))}
              </div>
            ) : merges.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <GitMerge className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-base font-medium text-gray-600 dark:text-gray-400">
                  {k.noMerges}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
                  {k.mergesDesc}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {merges.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 px-1 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        <GitMerge className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {m.canonical}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                            {(k[m.category as keyof typeof k] as string) ?? m.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                          {k.mergedFrom}: {m.aliases.join(', ')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setPendingDeleteMerge(m)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                      aria-label={k.deleteMerge}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="suggestions" className="pb-2">
            {(() => {
              const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
              const hasPending = pendingSuggestions.length > 0;
              const canGenerate = !hasPending;

              return (
                <>
                  {/* Generate button */}
                  <div className="flex flex-col items-center gap-2 py-4 pt-0">
                    <Button
                      size="sm"
                      onClick={generateSuggestions}
                      disabled={generatingSuggestions || suggestionsLoading || !canGenerate}
                      className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0 gap-1.5"
                    >
                      <Wand2 className={cn('h-4 w-4', generatingSuggestions && 'animate-spin')} />
                      {generatingSuggestions ? k.suggestionsGenerating : k.suggestionsAskAI}
                    </Button>
                    {!canGenerate && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs">
                        {k.suggestionsCompleteFirst}
                      </p>
                    )}
                    {canGenerate && !generatingSuggestions && suggestions.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs">
                        {k.suggestionsAskAIDesc}
                      </p>
                    )}
                  </div>

                  {/* Suggestions list */}
                  {suggestionsLoading || generatingSuggestions ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-20 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Wand2 className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-base font-medium text-gray-600 dark:text-gray-400">
                        {k.suggestionsEmpty}
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {suggestions.map((s) => (
                        <li
                          key={s.id}
                          className={cn(
                            'flex items-start justify-between gap-3 px-1 py-3 transition-colors',
                            s.status === 'pending'
                              ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              : 'opacity-50',
                          )}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5',
                                s.status === 'accepted'
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                  : s.status === 'rejected'
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                                    : 'bg-[#efd957]/20 text-[#a3891f] dark:text-[#efd957]',
                              )}
                            >
                              {s.status === 'accepted' ? (
                                <CheckCircle className="h-4 w-4" />
                              ) : s.status === 'rejected' ? (
                                <XCircle className="h-4 w-4" />
                              ) : (
                                <Wand2 className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                  {s.suggestedCanonical}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 shrink-0"
                                >
                                  {(k[s.category as keyof typeof k] as string) ?? s.category}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {s.aliases.join(', ')}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">
                                {s.reason}
                              </p>
                            </div>
                          </div>
                          {s.status === 'pending' && (
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              <button
                                onClick={() => setPendingAcceptSuggestion(s)}
                                className="p-1.5 rounded text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                aria-label={k.suggestionsAccept}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleRejectSuggestion(s.id)}
                                className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                aria-label={k.suggestionsReject}
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}
          </TabsContent>
        </Tabs>
      </CardContent>

      {modalChip && (
        <ExploreEmailsModal
          term={modalChip.value}
          category={modalChip.category}
          categoryLabel={modalChip.label}
          aliases={modalChip.aliases}
          onClose={() => setModalChip(null)}
          onRequestFullscreen={setFullscreenEmail}
        />
      )}

      {/* Full email modal — stacked above ExploreEmailsModal with higher z-index */}
      <FullPageEmailDialog
        open={!!fullscreenEmail}
        onClose={() => setFullscreenEmail(null)}
        subject={fullscreenEmail?.subject ?? ''}
        body={fullscreenEmail?.body ?? null}
        overlayClassName="z-[100]"
        contentClassName="z-[100]"
      />

      {/* Entity merge dialog */}
      {showMergeDialog && selectedChips.length >= 2 && selectedCategory && (
        <EntityMergeDialog
          selected={selectedChips}
          categoryLabel={(k[selectedCategory as keyof typeof k] as string) ?? selectedCategory}
          onClose={() => setShowMergeDialog(false)}
          onMerge={handleCreateMerge}
        />
      )}

      {/* Suggestion accept dialog — reuses EntityMergeDialog with the AI-suggested aliases */}
      {pendingAcceptSuggestion && (
        <EntityMergeDialog
          selected={pendingAcceptSuggestion.aliases.map((alias) => ({
            value: alias,
            category: pendingAcceptSuggestion.category,
          }))}
          categoryLabel={
            (k[pendingAcceptSuggestion.category as keyof typeof k] as string) ??
            pendingAcceptSuggestion.category
          }
          defaultCanonical={pendingAcceptSuggestion.suggestedCanonical}
          onClose={() => setPendingAcceptSuggestion(null)}
          onMerge={handleAcceptSuggestion}
        />
      )}

      {/* Delete merge confirmation drawer */}
      <Drawer
        open={!!pendingDeleteMerge}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteMerge(null);
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{k.deleteMerge}</DrawerTitle>
            <DrawerDescription>
              {k.deleteConfirm}{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                &ldquo;{pendingDeleteMerge?.canonical}&rdquo;
              </span>
              ? {k.cannotBeUndone}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pb-8">
            <Button
              variant="ghost"
              onClick={() => setPendingDeleteMerge(null)}
              disabled={deletingMerge}
              className="flex-1"
            >
              {k.cancelMerge}
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteMerge}
              disabled={deletingMerge}
              className="flex-1"
            >
              {deletingMerge ? '…' : k.deleteMerge}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}
