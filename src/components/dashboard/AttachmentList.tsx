'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2, Paperclip } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import type { EmailAttachmentInfo } from '@/types';

interface AttachmentListProps {
  emailId?: string;
  names: string[];
  attachments?: EmailAttachmentInfo[];
}

export function AttachmentList({ emailId, names, attachments = [] }: AttachmentListProps) {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const items =
    attachments.length > 0
      ? attachments
      : names.map((name, index) => ({
          id: `fallback-${index}`,
          filename: name,
          contentType: 'application/octet-stream',
          canDownload: false,
        }));

  const handleDownload = async (attachment: EmailAttachmentInfo) => {
    if (!emailId || !attachment.canDownload || !authUser) {
      toast.error(t.dashboard.toasts.downloadAttachmentFailed);
      return;
    }

    setDownloadingId(attachment.id);

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/email/${emailId}/attachments/${attachment.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = attachment.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Failed to download attachment from UI', {
        emailId,
        attachmentId: attachment.id,
        filename: attachment.filename,
        error,
      });
      toast.error(t.dashboard.toasts.downloadAttachmentFailed);
    } finally {
      setDownloadingId((current) => (current === attachment.id ? null : current));
    }
  };

  return (
    <ul className="list-none space-y-0.5">
      {items.map((attachment, i) => (
        <li key={`${i}-${attachment.filename}`} className="flex items-center gap-1.5 min-w-0">
          <Paperclip className="h-3 w-3 shrink-0 text-gray-400" />
          <span className="truncate flex-1 min-w-0">{attachment.filename}</span>
          {attachment.canDownload && emailId ? (
            <button
              type="button"
              onClick={() => void handleDownload(attachment)}
              disabled={downloadingId === attachment.id}
              className="shrink-0 text-[#a3891f] hover:text-[#8f781a] disabled:text-gray-400 transition-colors"
              aria-label={`${t.dashboard.emailHistory.downloadAttachment}: ${attachment.filename}`}
              title={t.dashboard.emailHistory.downloadAttachment}
            >
              {downloadingId === attachment.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
