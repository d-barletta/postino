'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
  Tag,
  Search,
  X,
  GitMerge,
  Trash2,
  ChevronDown,
  ChevronUp,
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
import type { EntityMerge, EntityCategory } from '@/types';

interface KnowledgeItem {
  value: string;
  count: number;
}

interface KnowledgeData {
  topics: KnowledgeItem[];
  tags: KnowledgeItem[];
  people: KnowledgeItem[];
  organizations: KnowledgeItem[];
  places: KnowledgeItem[];
  events: KnowledgeItem[];
  totalEmails: number;
}

type CategoryKey = 'all' | 'topics' | 'people' | 'organizations' | 'places' | 'events' | 'tags';

interface CategoryConfig {
  key: CategoryKey;
  icon: React.ReactNode;
  dataKey?: keyof Omit<KnowledgeData, 'totalEmails'>;
}

const CATEGORIES: CategoryConfig[] = [
  { key: 'all', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: 'topics', icon: <Hash className="h-3.5 w-3.5" />, dataKey: 'topics' },
  { key: 'people', icon: <Users className="h-3.5 w-3.5" />, dataKey: 'people' },
  { key: 'organizations', icon: <Building2 className="h-3.5 w-3.5" />, dataKey: 'organizations' },
  { key: 'places', icon: <MapPin className="h-3.5 w-3.5" />, dataKey: 'places' },
  { key: 'events', icon: <Calendar className="h-3.5 w-3.5" />, dataKey: 'events' },
  { key: 'tags', icon: <Tag className="h-3.5 w-3.5" />, dataKey: 'tags' },
];

const SECTION_ICONS: Record<string, React.ReactNode> = {
  topics: <Hash className="h-4 w-4" />,
  people: <Users className="h-4 w-4" />,
  organizations: <Building2 className="h-4 w-4" />,
  places: <MapPin className="h-4 w-4" />,
  events: <Calendar className="h-4 w-4" />,
  tags: <Tag className="h-4 w-4" />,
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

function Chip({ item, maxCount, detailed = false, highlight = '', mergeMode, selected, isMerged = false, onClick }: ChipProps) {
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
        <span className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-[#a3891f] bg-[#efd957]' : 'border-gray-400 dark:border-gray-500',
        )} />
      )}
      {isMerged && !mergeMode && (
        <GitMerge className="h-3 w-3 shrink-0 text-gray-400 dark:text-gray-500" />
      )}
      <span className="truncate max-w-[180px]">
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

function Section({ title, icon, items, category, highlight = '', mergeMode, selectedKeys, mergedCanonicals, onChipClick }: SectionProps) {
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

export function KnowledgeTab() {
  const { t } = useI18n();
  const { firebaseUser } = useAuth();
  const k = t.dashboard.knowledge;
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalChip, setModalChip] = useState<{ value: string; category: string; label: string; aliases?: string[] } | null>(null);
  const [fullscreenEmail, setFullscreenEmail] = useState<{ subject: string; body: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mergeMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entity merges
  const [merges, setMerges] = useState<EntityMerge[]>([]);
  const [mergesLoading, setMergesLoading] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedChips, setSelectedChips] = useState<SelectedChip[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showManageMerges, setShowManageMerges] = useState(false);
  const [mergeActionMessage, setMergeActionMessage] = useState<string | null>(null);
  const [pendingDeleteMerge, setPendingDeleteMerge] = useState<EntityMerge | null>(null);
  const [deletingMerge, setDeletingMerge] = useState(false);

  // Clear any pending merge message timer when the component unmounts.
  useEffect(() => {
    return () => {
      if (mergeMessageTimerRef.current !== null) {
        clearTimeout(mergeMessageTimerRef.current);
      }
    };
  }, []);

  // Integrate the fullscreen email dialog with browser history.
  useModalHistory(!!fullscreenEmail, () => setFullscreenEmail(null));

  const fetchKnowledge = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/email/knowledge', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as KnowledgeData;
      setData(json);
    } catch {
      setError('Failed to load knowledge data');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  const fetchMerges = useCallback(async () => {
    if (!firebaseUser) return;
    setMergesLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/entities/merges', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { merges: EntityMerge[] };
        setMerges(json.merges ?? []);
      }
    } finally {
      setMergesLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchKnowledge();
    fetchMerges();
  }, [fetchKnowledge, fetchMerges]);

  /** Set of "category:canonical" for merged entities (to show the merge icon). */
  const mergedCanonicals = useMemo(
    () => new Set(merges.map((m) => `${m.category}:${m.canonical}`)),
    [merges],
  );

  /** Map from "category:canonical" → aliases for ExploreEmailsModal. */
  const mergeAliasMap = useMemo(
    () =>
      new Map<string, string[]>(
        merges.map((m) => [`${m.category}:${m.canonical}`, m.aliases]),
      ),
    [merges],
  );

  const categoryLabel = (key: CategoryKey): string => {
    if (key === 'all') return k.allCategories;
    return k[key];
  };

  const toggleMergeMode = useCallback(() => {
    setMergeMode((prev) => {
      if (prev) setSelectedChips([]);
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
      const label =
        catKey === 'all'
          ? k.allCategories
          : (k[catKey] ?? category);
      const mergeKey = `${category}:${value}`;
      const aliases = mergeAliasMap.get(mergeKey);
      setModalChip({ value, category, label, aliases });
    },
    [mergeMode, k, mergeAliasMap],
  );

  /** True when all selected chips share the same category and there are at least 2. */
  const canMergeSelected =
    selectedChips.length >= 2 &&
    new Set(selectedChips.map((c) => c.category)).size === 1;

  const handleCreateMerge = useCallback(
    async (canonical: string, aliases: string[], category: EntityCategory) => {
      if (!firebaseUser) return;
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/entities/merges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ canonical, aliases, category }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? 'Failed to create merge');
      }
      await Promise.all([fetchKnowledge(), fetchMerges()]);
      setMergeMode(false);
      setSelectedChips([]);
      setMergeActionMessage(k.mergeCreated);
      if (mergeMessageTimerRef.current !== null) clearTimeout(mergeMessageTimerRef.current);
      mergeMessageTimerRef.current = setTimeout(() => setMergeActionMessage(null), 3000);
    },
    [firebaseUser, fetchKnowledge, fetchMerges, k],
  );

  const handleDeleteMerge = useCallback(
    async () => {
      if (!firebaseUser || !pendingDeleteMerge) return;
      setDeletingMerge(true);
      try {
        const token = await firebaseUser.getIdToken();
        await fetch(`/api/entities/merges/${pendingDeleteMerge.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await Promise.all([fetchKnowledge(), fetchMerges()]);
        setMergeActionMessage(k.mergeDeleted);
        if (mergeMessageTimerRef.current !== null) clearTimeout(mergeMessageTimerRef.current);
        mergeMessageTimerRef.current = setTimeout(() => setMergeActionMessage(null), 3000);
      } finally {
        setDeletingMerge(false);
        setPendingDeleteMerge(null);
      }
    },
    [firebaseUser, pendingDeleteMerge, fetchKnowledge, fetchMerges, k],
  );

  const hasAnyData =
    data &&
    (data.topics.length > 0 ||
      data.tags.length > 0 ||
      data.people.length > 0 ||
      data.organizations.length > 0 ||
      data.places.length > 0 ||
      data.events.length > 0);

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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {k.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {k.subtitle}
            </p>
            {data && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {k.emailsAnalyzed.replace('{count}', String(data.totalEmails))}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasAnyData && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMergeMode}
                aria-label={mergeMode ? k.cancelMerge : k.merge}
                className={cn(mergeMode && 'text-[#a3891f] dark:text-[#efd957]')}
              >
                <GitMerge className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { fetchKnowledge(); fetchMerges(); }}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
          {merges.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowManageMerges((v) => !v)}
              aria-label={k.manageMerges}
              className="gap-1.5 text-xs"
            >
              {k.manageMerges}
              {showManageMerges ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        {/* Action message */}
        {mergeActionMessage && (
          <p className="mt-2 text-xs text-green-600 dark:text-green-400">{mergeActionMessage}</p>
        )}
      </CardHeader>

      {/* Sticky merge mode status bar (visible while scrolling through chips) */}
      {mergeMode && (
        <div className="sticky top-16 z-10 flex flex-col gap-1.5 border-b border-[#efd957]/40 bg-[#fffbeb] dark:bg-[#1c1500] px-4 py-2 text-sm text-[#a3891f] dark:text-[#efd957]">
          {/* Status + warning (truncated) */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0">
              {selectedChips.length > 0
                ? k.xSelected.replace('{count}', String(selectedChips.length))
                : k.mergeMode}
            </span>
            {selectedChips.length >= 2 && !canMergeSelected && (
              <span className="text-xs text-gray-500 dark:text-gray-400 truncate min-w-0">
                {k.mergeSameCategoryWarning}
              </span>
            )}
          </div>
          {/* Action buttons always on their own row, right-aligned, Cancel first */}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={toggleMergeMode}
            >
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

      <CardContent className="space-y-5">
        {/* Manage merges panel */}
        {showManageMerges && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{k.mergesTitle}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{k.mergesDesc}</p>
            {mergesLoading ? (
              <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : merges.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">{k.noMerges}</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {merges.map((m) => (
                  <li key={m.id} className="flex items-start justify-between gap-2 text-xs py-2 first:pt-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{m.canonical}</span>
                      <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                        {k[m.category as keyof typeof k] as string ?? m.category}
                      </Badge>
                      <p className="text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                        {k.mergedFrom}: {m.aliases.join(', ')}
                      </p>
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
          </div>
        )}

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
              onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
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

        {!loading && error && (
          <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
        )}

        {!loading && !error && !hasAnyData && data !== null && (
          <div className="text-center py-12">
            <Sparkles className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-base font-medium text-gray-600 dark:text-gray-400">
              {k.noData}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
              {k.noDataDesc}
            </p>
          </div>
        )}

        {!loading && !error && hasAnyData && activeCategory === 'all' && (
          <div className="space-y-5">
            {(['topics', 'people', 'organizations', 'places', 'events', 'tags'] as const).map((key) => (
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

        {!loading && !error && hasAnyData && activeCategory !== 'all' && (() => {
          const filtered = searchQuery
            ? activeItems.filter((i) => i.value.toLowerCase().includes(searchQuery.toLowerCase()))
            : activeItems;
          const selectedSet = new Set(selectedChips.map((c) => `${c.category}:${c.value}`));
          return (
            <div className="flex flex-wrap gap-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {k.noData}
                </p>
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
          categoryLabel={k[selectedCategory as keyof typeof k] as string ?? selectedCategory}
          onClose={() => setShowMergeDialog(false)}
          onMerge={handleCreateMerge}
        />
      )}

      {/* Delete merge confirmation drawer */}
      <Drawer open={!!pendingDeleteMerge} onOpenChange={(open) => { if (!open) setPendingDeleteMerge(null); }}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{k.deleteMerge}</DrawerTitle>
            <DrawerDescription>
              {k.deleteConfirm}{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">&ldquo;{pendingDeleteMerge?.canonical}&rdquo;</span>?
              {' '}{k.cannotBeUndone}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pb-8">
            <Button variant="danger" onClick={handleDeleteMerge} disabled={deletingMerge}>
              {deletingMerge ? '…' : k.deleteMerge}
            </Button>
            <Button variant="ghost" onClick={() => setPendingDeleteMerge(null)} disabled={deletingMerge}>
              {k.cancelMerge}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}
