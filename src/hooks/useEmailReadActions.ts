'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { EmailLog } from '@/types';

export function useEmailReadActions(setLogs: Dispatch<SetStateAction<EmailLog[]>>) {
  const { getIdToken } = useAuth();

  const setReadState = useCallback(
    async (emailId: string, isRead: boolean) => {
      setLogs((prev) => prev.map((log) => (log.id === emailId ? { ...log, isRead } : log)));
      try {
        const token = await getIdToken();
        await fetch(`/api/email/${emailId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead }),
        });
      } catch {
        // best-effort
      }
    },
    [getIdToken, setLogs],
  );

  const markEmailAsRead = useCallback(
    async (emailId: string) => {
      await setReadState(emailId, true);
    },
    [setReadState],
  );

  const toggleEmailRead = useCallback(
    async (emailId: string, currentIsRead: boolean) => {
      await setReadState(emailId, !currentIsRead);
    },
    [setReadState],
  );

  return { markEmailAsRead, toggleEmailRead };
}
