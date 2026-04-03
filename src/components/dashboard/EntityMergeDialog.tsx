'use client';

import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { EntityCategory } from '@/types';

interface SelectedEntity {
  value: string;
  category: EntityCategory;
}

interface EntityMergeDialogProps {
  selected: SelectedEntity[];
  categoryLabel: string;
  /** Optional default canonical name (e.g. pre-filled from an AI suggestion). */
  defaultCanonical?: string;
  onClose: () => void;
  onMerge: (canonical: string, aliases: string[], category: EntityCategory) => Promise<void>;
}

export function EntityMergeDialog({
  selected,
  categoryLabel,
  defaultCanonical,
  onClose,
  onMerge,
}: EntityMergeDialogProps) {
  const { t } = useI18n();
  const k = t.dashboard.knowledge;
  const [included, setIncluded] = useState<SelectedEntity[]>(selected);
  const [canonical, setCanonical] = useState(defaultCanonical ?? selected[0]?.value ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = selected[0]?.category;

  const removeEntity = (value: string) => {
    const next = included.filter((s) => s.value !== value);
    setIncluded(next);
    if (canonical === value) {
      setCanonical(next[0]?.value ?? '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonical.trim() || !category) return;
    setLoading(true);
    setError(null);
    try {
      await onMerge(
        canonical.trim(),
        included.map((s) => s.value),
        category,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create merge');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md" aria-describedby="merge-dialog-desc">
        <DialogHeader>
          <DialogTitle>{k.mergeDialogTitle}</DialogTitle>
          <DialogDescription id="merge-dialog-desc">{k.mergeDialogDesc}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category badge */}
          <div>
            <Badge variant="secondary" className="text-xs">
              {categoryLabel}
            </Badge>
          </div>

          {/* Selected entities list */}
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500 dark:text-gray-400">{k.mergeChipHint}</p>
            <div className="flex flex-wrap gap-1.5">
              {included.map((s) => (
                <span
                  key={s.value}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full pl-2.5 py-0.5 text-xs font-medium',
                    included.length > 2 ? 'pr-1' : 'pr-2.5',
                    'border transition-colors',
                    canonical === s.value
                      ? 'bg-[#efd957] border-[#e8cf3c] text-black'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setCanonical(s.value)}
                    className="cursor-pointer"
                  >
                    {s.value}
                  </button>
                  {included.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeEntity(s.value)}
                      className={cn(
                        'ml-0.5 mr-1 rounded-full p-0.5 transition-colors cursor-pointer',
                        canonical === s.value
                          ? 'hover:bg-[#e8cf3c]/60 text-black'
                          : 'hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-500 dark:text-gray-400',
                      )}
                      aria-label={`Remove ${s.value}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Canonical name input */}
          <div className="space-y-1.5">
            <label
              htmlFor="canonical-name"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {k.canonicalName}
            </label>
            <input
              id="canonical-name"
              value={canonical}
              onChange={(e) => setCanonical(e.target.value)}
              placeholder={k.canonicalNamePlaceholder}
              className={cn(
                'flex h-9 w-full rounded-md border border-gray-300 dark:border-gray-600',
                'bg-transparent px-3 py-1 text-sm shadow-sm',
                'transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#efd957] focus-visible:border-[#efd957]',
                'dark:bg-gray-800 dark:text-gray-100',
              )}
              required
            />
          </div>

          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              {k.cancelMerge}
            </Button>
            <Button
              type="submit"
              size="sm"
              autoFocus
              disabled={loading || !canonical.trim()}
              className="bg-[#efd957] hover:bg-[#e8cf3c] text-black border-0"
            >
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : k.createMerge}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
