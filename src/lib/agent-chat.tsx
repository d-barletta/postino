'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  sourceEmailIds?: string[];
}

// Module-level — survives tab switches within the same page session
let _persistedMessages: AgentMessage[] = [];

interface AgentChatContextValue {
  messages: AgentMessage[];
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  handleSubmit: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  clearMessages: () => void;
  /** Register the callback invoked after a successful API response (e.g. refresh credits). */
  registerCreditsCallback: (fn: () => void) => void;
}

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState<AgentMessage[]>(_persistedMessages);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const creditsCallbackRef = useRef<(() => void) | undefined>(undefined);

  // Keep module-level cache in sync so it survives tab switches
  useEffect(() => {
    _persistedMessages = messages;
  }, [messages]);

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || loading || !authUser) return;

    const userMessage: AgentMessage = { role: 'user', content: trimmed };
    const currentMessages = messages;
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const token = await getIdToken();
      const res = await fetch('/api/memory/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmed,
          history: currentMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.ok
            ? data.answer || t.dashboard.agent.noAnswer
            : data.error || t.dashboard.agent.errorFallback,
          sourceEmailIds:
            res.ok && Array.isArray(data.sourceEmailIds) && data.sourceEmailIds.length > 0
              ? (data.sourceEmailIds as string[])
              : undefined,
        },
      ]);
      if (res.ok) {
        creditsCallbackRef.current?.();
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t.dashboard.agent.errorFallback },
      ]);
    } finally {
      setLoading(false);
    }
  }, [query, loading, authUser, messages, getIdToken, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const clearMessages = useCallback(() => {
    _persistedMessages = [];
    setMessages([]);
  }, []);

  const registerCreditsCallback = useCallback((fn: () => void) => {
    creditsCallbackRef.current = fn;
  }, []);

  return (
    <AgentChatContext.Provider
      value={{
        messages,
        loading,
        query,
        setQuery,
        handleSubmit,
        handleKeyDown,
        clearMessages,
        registerCreditsCallback,
      }}
    >
      {children}
    </AgentChatContext.Provider>
  );
}

export function useAgentChat(): AgentChatContextValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) throw new Error('useAgentChat must be used within AgentChatProvider');
  return ctx;
}
