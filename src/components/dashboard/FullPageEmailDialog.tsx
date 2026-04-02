'use client';

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

interface FullPageEmailDialogProps {
  open: boolean;
  onClose: () => void;
  subject: string;
  body: string | null;
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
  loading,
  contentClassName,
  overlayClassName,
}: FullPageEmailDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        hideCloseButton
        animation="slide-from-bottom"
        overlayClassName={overlayClassName}
        className={cn('w-[99vw] max-w-5xl h-[99vh] flex flex-col p-0 overflow-hidden gap-0', contentClassName)}
        aria-describedby={undefined}
      >
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}
        {!loading && body && (
          <SafeEmailIframe
            html={body}
            className="flex-1"
          />
        )}
        {!loading && !body && (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            {t.emailOriginal.noOriginalContent}
          </div>
        )}
        <DialogFooter className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
          <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {subject}
          </DialogTitle>
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
