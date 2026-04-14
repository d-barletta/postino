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

const STORAGE_MAX = 10;
const CONTENT_MAX_LENGTH = 20_000;

/** Strip HTML tags to prevent stored XSS when content is read back. */
function sanitizeContent(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/<[^>]*>/g, '').slice(0, CONTENT_MAX_LENGTH);
}

function storageKey(userId: string) {
  return `postino_chat_v1_${userId}`;
}

function loadFromStorage(userId: string): AgentMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .filter(
        (m) =>
          m !== null &&
          typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string',
      )
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: sanitizeContent(m.content),
        ...(Array.isArray(m.sourceEmailIds) &&
        m.sourceEmailIds.every((id: unknown) => typeof id === 'string')
          ? { sourceEmailIds: m.sourceEmailIds as string[] }
          : {}),
      }));
    return valid.slice(-STORAGE_MAX);
  } catch {
    return [];
  }
}

function saveToStorage(userId: string, messages: AgentMessage[]) {
  try {
    const payload = messages.slice(-STORAGE_MAX).map(({ role, content, sourceEmailIds }) => ({
      role,
      content: sanitizeContent(content),
      ...(sourceEmailIds ? { sourceEmailIds } : {}),
    }));
    localStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage unavailable — fail silently.
  }
}

function clearFromStorage(userId: string) {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}

interface AgentChatContextValue {
  messages: AgentMessage[];
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  handleSubmit: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Re-send a specific message content as if the user typed it. */
  repeatMessage: (content: string) => void;
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
  const storageInitializedRef = useRef(false);

  // On first auth, load persisted messages from localStorage (overrides module cache)
  useEffect(() => {
    if (!authUser?.id || storageInitializedRef.current) return;
    storageInitializedRef.current = true;
    const stored = loadFromStorage(authUser.id);
    if (stored.length > 0) {
      _persistedMessages = stored;
      setMessages(stored);
    }
  }, [authUser?.id]);

  // Keep module-level cache in sync so it survives tab switches,
  // and persist last 10 messages to localStorage for cross-session recovery.
  useEffect(() => {
    _persistedMessages = messages;
    if (authUser?.id) {
      saveToStorage(authUser.id, messages);
    }
  }, [messages, authUser?.id]);

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
    if (authUser?.id) {
      clearFromStorage(authUser.id);
    }
  }, [authUser?.id]);

  const repeatMessage = useCallback(
    (content: string) => {
      if (!content.trim() || loading) return;
      const userMessage: AgentMessage = { role: 'user', content: content.trim() };
      const currentMessages = _persistedMessages;
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);
      getIdToken()
        .then((token) =>
          fetch('/api/memory/chat', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: content.trim(),
              history: currentMessages.map(({ role, content: c }) => ({ role, content: c })),
            }),
          }),
        )
        .then(async (res) => {
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
          if (res.ok) creditsCallbackRef.current?.();
        })
        .catch(() => {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: t.dashboard.agent.errorFallback },
          ]);
        })
        .finally(() => setLoading(false));
    },
    [loading, getIdToken, t],
  );

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
        repeatMessage,
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
