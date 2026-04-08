'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Bot, Send, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AgentTab() {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed || loading || !firebaseUser) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/memory/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.ok
            ? data.answer || t.dashboard.agent.noAnswer
            : data.error || t.dashboard.agent.errorFallback,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t.dashboard.agent.errorFallback },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        {/* Header */}
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#efd957] text-gray-900">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>{t.dashboard.agent.title}</CardTitle>
              <CardDescription className="mt-0.5">
                {t.dashboard.agent.subtitle}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Chat area */}
          <div className="flex h-[320px] flex-col gap-3 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50 sm:h-[420px] lg:h-[520px]">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <Bot className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="max-w-xs text-sm text-gray-400 dark:text-gray-500">
                  {t.dashboard.agent.placeholder}
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-2',
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                      msg.role === 'user'
                        ? 'bg-[#efd957] text-gray-900'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                    )}
                  >
                    {msg.role === 'user' ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </div>
                  {/* Bubble */}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'rounded-tr-sm bg-[#efd957] text-gray-900'
                        : 'rounded-tl-sm border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
                    )}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.dashboard.agent.inputPlaceholder}
                rows={2}
                disabled={loading}
                className="resize-none"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!query.trim() || loading}
              loading={loading}
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              aria-label={t.dashboard.agent.send}
            >
              {!loading && <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            {t.dashboard.agent.sendHint}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
