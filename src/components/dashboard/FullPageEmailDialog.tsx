'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SafeEmailIframe } from '@/components/ui/SafeEmailIframe';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { useModalHistory } from '@/hooks/useModalHistory';

interface FullPageEmailDialogProps {
  open: boolean;
  onClose: () => void;
  subject: string;
  body: string | null;
  /** When provided, a toggle is shown in the footer to switch between original and rewritten. */
  processedBody?: string | null;
  /** When true, dialog opens with "Rewritten" pre-selected (mirrors the state in EmailDetailTabs). */
  initialShowRewritten?: boolean;
  loading?: boolean;
  /** Extra CSS classes forwarded to DialogContent (e.g. "z-[100]" for stacking). */
  contentClassName?: string;
  /** Extra CSS classes forwarded to the overlay (e.g. "z-[100]" for stacking). */
  overlayClassName?: string;
}

/**
 * Reusable full-page email content dialog used in the Inbox tab,
 * the Explore tab, and the original-email page.
 */
export function FullPageEmailDialog({
  open,
  onClose,
  subject,
  body,
  processedBody,
  initialShowRewritten = false,
  loading,
  contentClassName,
  overlayClassName,
}: FullPageEmailDialogProps) {
  const { t } = useI18n();
  const hasRewritten = Boolean(processedBody);
  const [showRewritten, setShowRewritten] = useState(initialShowRewritten);

  // Sync toggle with the initial value whenever the dialog opens.
  useEffect(() => {
    if (open) setShowRewritten(initialShowRewritten);
  }, [open]);

  const displayBody = hasRewritten && showRewritten ? (processedBody ?? body) : body;

  useModalHistory(open, onClose);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        animation="slide-from-bottom"
        overlayClassName={overlayClassName}
        className={cn(
          'w-screen h-screen max-w-5xl flex flex-col p-0 overflow-hidden gap-0 z-53',
          contentClassName,
        )}
        aria-describedby={undefined}
      >
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        {!loading && displayBody && <SafeEmailIframe html={displayBody} className="flex-1" />}
        {!loading && !displayBody && (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            {t.emailOriginal.noOriginalContent}
          </div>
        )}
        <DialogFooter className="shrink-0 px-6 py-6 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {hasRewritten && (
              <div className="flex items-center gap-1 shrink-0">
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
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {subject}
            </DialogTitle>
          </div>
          <DialogClose asChild>
            <Button size="sm" className="shrink-0">
              {t.dashboard.rules.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
