'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { ExpandedEmailData } from '@/components/dashboard/EmailListItem';

/**
 * Manages per-email expanded data (original body, addresses, attachments).
 * Shared by EmailLogsList, EmailSearchTab, and ExploreEmailsModal.
 */
export function useEmailExpansion() {
  const { authUser, getIdToken } = useAuth();
  const [expandedData, setExpandedData] = useState<Record<string, ExpandedEmailData>>({});
  const fetchedExpandedIds = useRef<Set<string>>(new Set());

  const fetchExpandedEmail = useCallback(
    async (logId: string) => {
      if (!authUser) return;
      if (fetchedExpandedIds.current.has(logId)) return;
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
        const token = await getIdToken();
        const res = await fetch(`/api/email/original/${logId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setExpandedData((prev) => ({
            ...prev,
            [logId]: {
              originalBody: data.originalBody ?? null,
              toAddress: data.toAddress ?? '',
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
    [authUser, getIdToken],
  );

  /** Clears all cached data (call when the email list resets, e.g. modal close / filter change). */
  const resetExpanded = useCallback(() => {
    setExpandedData({});
    fetchedExpandedIds.current = new Set();
  }, []);

  return { expandedData, fetchExpandedEmail, resetExpanded };
}
