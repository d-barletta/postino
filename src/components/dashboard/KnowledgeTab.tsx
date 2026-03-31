'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { buildSandboxedEmailSrcDoc } from '@/lib/email-iframe';
import {
  RefreshCw,
  Sparkles,
  Hash,
  Users,
  Building2,
  MapPin,
  Calendar,
  Tag,
} from 'lucide-react';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { useModalHistory } from '@/hooks/useModalHistory';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/Dialog';

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

interface ChipProps {
  item: KnowledgeItem;
  maxCount: number;
  detailed?: boolean;
  onClick: () => void;
}

function Chip({ item, maxCount, detailed = false, onClick }: ChipProps) {
  const freqClass = detailed ? getFrequencyClass(item.count, maxCount) : 'text-xs px-2 py-0.5';
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border transition-all',
        'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
        'text-gray-700 dark:text-gray-300',
        'hover:border-[#efd957] hover:bg-[#efd957]/10 hover:text-[#a3891f] dark:hover:text-[#efd957]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#efd957]',
        freqClass,
      )}
    >
      <span className="truncate max-w-[180px]">{item.value}</span>
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
  onChipClick: (value: string, category: string) => void;
}

function Section({ title, icon, items, category, onChipClick }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {title}
        </h3>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Chip key={item.value} item={item} maxCount={items[0]?.count ?? 1} onClick={() => onChipClick(item.value, category)} />
        ))}
      </div>
    </div>
  );
}

export function KnowledgeTab() {
  const { t } = useI18n();
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [modalChip, setModalChip] = useState<{ value: string; category: string; label: string } | null>(null);
  const [fullscreenEmail, setFullscreenEmail] = useState<{ subject: string; body: string } | null>(null);

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

  useEffect(() => {
    fetchKnowledge();
  }, [fetchKnowledge]);

  const categoryLabel = (key: CategoryKey): string => {
    if (key === 'all') return t.dashboard.knowledge.allCategories;
    return t.dashboard.knowledge[key];
  };

  const handleChipClick = useCallback(
    (value: string, category: string) => {
      const catKey = category as CategoryKey;
      const label =
        catKey === 'all'
          ? t.dashboard.knowledge.allCategories
          : (t.dashboard.knowledge[catKey] ?? category);
      setModalChip({ value, category, label });
    },
    [t],
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t.dashboard.knowledge.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {t.dashboard.knowledge.subtitle}
            </p>
            {data && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {t.dashboard.knowledge.emailsAnalyzed.replace('{count}', String(data.totalEmails))}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchKnowledge}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
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
                  ? 'bg-[#efd957] border-[#efd957] text-[#a3891f] shadow-sm'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-[#efd957]/60',
              )}
            >
              {cat.icon}
              {categoryLabel(cat.key)}
            </button>
          ))}
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
              {t.dashboard.knowledge.noData}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm mx-auto">
              {t.dashboard.knowledge.noDataDesc}
            </p>
          </div>
        )}

        {!loading && !error && hasAnyData && activeCategory === 'all' && (
          <div className="space-y-5">
            {(['topics', 'people', 'organizations', 'places', 'events', 'tags'] as const).map((key) => (
              <Section
                key={key}
                title={t.dashboard.knowledge[key]}
                icon={SECTION_ICONS[key]}
                items={data?.[key] ?? []}
                category={key}
                onChipClick={handleChipClick}
              />
            ))}
          </div>
        )}

        {!loading && !error && hasAnyData && activeCategory !== 'all' && (
          <div className="flex flex-wrap gap-2">
            {activeItems.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t.dashboard.knowledge.noData}
              </p>
            ) : (
              activeItems.map((item) => (
                <Chip
                  key={item.value}
                  item={item}
                  maxCount={activeMaxCount}
                  detailed
                  onClick={() => handleChipClick(item.value, activeCategory)}
                />
              ))
            )}
          </div>
        )}
      </CardContent>

      {modalChip && (
        <ExploreEmailsModal
          term={modalChip.value}
          category={modalChip.category}
          categoryLabel={modalChip.label}
          onClose={() => setModalChip(null)}
          onRequestFullscreen={setFullscreenEmail}
        />
      )}

      {/* Full email modal — stacked above ExploreEmailsModal with higher z-index */}
      <Dialog open={!!fullscreenEmail} onOpenChange={(open) => { if (!open) setFullscreenEmail(null); }}>
        <DialogContent
          overlayClassName="z-[100]"
          className="z-[100] w-[95vw] max-w-4xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
        >
          <div className="h-14 shrink-0 px-6 border-b border-gray-200 dark:border-gray-800 flex items-center">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-4">
              {fullscreenEmail?.subject}
            </DialogTitle>
          </div>
          <iframe
            sandbox=""
            srcDoc={fullscreenEmail ? buildSandboxedEmailSrcDoc(fullscreenEmail.body) : ''}
            className="w-full flex-1 border-0"
            title="Original email content full page"
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
