'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
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
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.error || t.dashboard.agent.errorFallback,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.answer || t.dashboard.agent.noAnswer,
          },
        ]);
      }
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
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t.dashboard.agent.title}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t.dashboard.agent.subtitle}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Message list */}
            <div className="min-h-[300px] max-h-[500px] overflow-y-auto flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/50">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-4">
                  {t.dashboard.agent.placeholder}
                </p>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex gap-2 items-start',
                      msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                    )}
                  >
                    <div
                      className={cn(
                        'flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center',
                        msg.role === 'user'
                          ? 'bg-[#efd957] text-gray-900'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
                      )}
                    >
                      {msg.role === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div
                      className={cn(
                        'rounded-xl px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'bg-[#efd957] text-gray-900'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700',
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex gap-2 items-start">
                  <div className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-xl px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="flex gap-1 items-center">
                      <span className="animate-bounce delay-0 h-1.5 w-1.5 rounded-full bg-gray-400" />
                      <span className="animate-bounce delay-150 h-1.5 w-1.5 rounded-full bg-gray-400" />
                      <span className="animate-bounce delay-300 h-1.5 w-1.5 rounded-full bg-gray-400" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input area */}
            <div className="flex gap-2 items-end">
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
                aria-label={t.dashboard.agent.send}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">{t.dashboard.agent.send}</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
