'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/Drawer';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Bot, Send, User, Trash2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Module-level — survives tab switches within the same page session
let _persistedMessages: Message[] = [];

export function AgentTab() {
  const { firebaseUser } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>(_persistedMessages);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [clearDrawerOpen, setClearDrawerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep module-level cache in sync so it survives tab switches
  useEffect(() => {
    _persistedMessages = messages;
  }, [messages]);

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

  // Shift+Enter = send, plain Enter = new line (default textarea behaviour)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClearConfirm = () => {
    _persistedMessages = [];
    setMessages([]);
    setClearDrawerOpen(false);
  };

  const a = t.dashboard.agent;

  return (
    <div className="space-y-4">
      <Card>
        {/* Header — same plain style as KnowledgeTab / RelationsTab */}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {a.title}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{a.subtitle}</p>
            </div>
            <div className="shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearDrawerOpen(true)}
                aria-label={a.clearConversation}
                disabled={messages.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Chat area — no border, no background */}
          <div className="flex h-[320px] flex-col gap-3 overflow-y-auto p-1 sm:h-[420px] lg:h-[520px]">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <Bot className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="max-w-xs text-sm text-gray-400 dark:text-gray-500">
                  {a.placeholder}
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

          {/* Input row — single line, inline with send button */}
          <div className="flex items-center gap-2">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={a.inputPlaceholder}
              rows={1}
              disabled={loading}
              aria-multiline="true"
              className="min-h-0 flex-1 resize-none leading-normal"
            />
            <Button
              onClick={handleSubmit}
              disabled={!query.trim() || loading}
              loading={loading}
              size="icon"
              className="h-10 w-10 flex-shrink-0"
              aria-label={a.send}
            >
              {!loading && <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">{a.sendHint}</p>
        </CardContent>
      </Card>

      {/* Clear conversation confirmation drawer */}
      <Drawer open={clearDrawerOpen} onOpenChange={setClearDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{a.clearConfirmTitle}</DrawerTitle>
            <DrawerDescription>{a.clearConfirmDescription}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pb-8">
            <Button
              variant="ghost"
              onClick={() => setClearDrawerOpen(false)}
              className="flex-1"
            >
              {a.cancelClear}
            </Button>
            <Button variant="danger" onClick={handleClearConfirm} className="flex-1">
              {a.clearConfirmButton}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
