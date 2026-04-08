'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/InputGroup';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
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
import { Send, User, Trash2 } from 'lucide-react';

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

  // Enter = send, Shift+Enter = new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{a.title}</h2>
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

        <CardContent className="flex flex-col gap-3 px-3 py-3 sm:px-4">
          {/* Chat area — no border, no background */}
          <div className="flex h-80 flex-col gap-3 overflow-y-auto p-1 sm:h-105 lg:h-130">
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                  <PostinoLogo className="h-6 w-6" title={a.title} />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">{a.placeholder}</p>
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
                  {/* Avatar — user avatar always uses fixed dark icon color regardless of dark mode */}
                  <div
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                      msg.role === 'user'
                        ? 'bg-[#efd957]'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                    )}
                    style={msg.role === 'user' ? { color: '#171717' } : undefined}
                  >
                    {msg.role === 'user' ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <PostinoLogo className="h-4 w-4" title={a.title} />
                    )}
                  </div>
                  {/* Bubble — user bubble always has dark text regardless of dark mode */}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'rounded-tr-sm bg-[#efd957]'
                        : 'rounded-tl-sm border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
                    )}
                    style={msg.role === 'user' ? { color: '#171717' } : undefined}
                  >
                    {msg.content}
                  </div>
                </div>
              ))
            )}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-start gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  <PostinoLogo className="h-4 w-4" title={a.title} />
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

          {/* Composer — textarea with a grouped footer action */}
          <InputGroup>
            <InputGroupTextarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={a.inputPlaceholder}
              rows={1}
              disabled={loading}
              aria-multiline="true"
              className="leading-normal"
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                className="ml-auto"
                onClick={handleSubmit}
                disabled={!query.trim() || loading}
                loading={loading}
                size="icon-sm"
                variant="default"
                aria-label={a.send}
              >
                {!loading && <Send className="h-4 w-4" />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
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
            <Button variant="ghost" onClick={() => setClearDrawerOpen(false)} className="flex-1">
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
