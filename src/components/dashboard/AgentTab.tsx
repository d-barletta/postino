'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogClose,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { useModalHistory } from '@/hooks/useModalHistory';
import { cn } from '@/lib/utils';
import { Send, User, Trash2, Maximize2, Mail } from 'lucide-react';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sourceEmailIds?: string[];
}

// Module-level — survives tab switches within the same page session
let _persistedMessages: Message[] = [];

interface ChatContentProps {
  messages: Message[];
  loading: boolean;
  query: string;
  setQuery: (q: string) => void;
  handleSubmit: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  a: ReturnType<typeof useI18n>['t']['dashboard']['agent'];
  heightClass?: string;
  wrapperClass?: string;
  onOpenSourceEmails?: (ids: string[]) => void;
}

function ChatContent({
  messages,
  loading,
  query,
  setQuery,
  handleSubmit,
  handleKeyDown,
  bottomRef,
  chatContainerRef,
  a,
  heightClass = 'h-80 sm:h-105 lg:h-130',
  wrapperClass = '',
  onOpenSourceEmails,
}: ChatContentProps) {
  return (
    <div className={cn('flex flex-col gap-3', wrapperClass)}>
      {/* Chat area */}
      <div
        ref={chatContainerRef}
        className={cn('flex flex-col gap-3 overflow-y-auto p-1', heightClass)}
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <PostinoLogo className="h-6 w-6" title={a.title} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">{a.placeholder}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{a.sendHint}</p>
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
              {/* Bubble */}
              <div className={cn('max-w-[85%] flex flex-col gap-1.5')}>
                <div
                  className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-tr-sm bg-[#efd957] whitespace-pre-wrap'
                      : 'rounded-tl-sm border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
                  )}
                  style={msg.role === 'user' ? { color: '#171717' } : undefined}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1 prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-code:text-xs">
                      <ReactMarkdown
                        components={{
                          a: ({
                            href,
                            children,
                          }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
                            if (href?.startsWith('email-ref:') && onOpenSourceEmails) {
                              const logId = href.slice('email-ref:'.length);
                              return (
                                <button
                                  onClick={() => onOpenSourceEmails([logId])}
                                  className="inline-flex items-center gap-1 text-[#b8991a] dark:text-[#efd957] underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer not-prose"
                                >
                                  <Mail className="inline h-3 w-3 shrink-0" />
                                  {children}
                                </button>
                              );
                            }
                            return (
                              <a href={href} target="_blank" rel="noopener noreferrer">
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
                {/* Source emails link */}
                {msg.role === 'assistant' &&
                  msg.sourceEmailIds &&
                  msg.sourceEmailIds.length > 0 &&
                  onOpenSourceEmails && (
                    <button
                      onClick={() => onOpenSourceEmails(msg.sourceEmailIds!)}
                      className="flex items-center gap-1.5 self-start text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-1"
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      {a.sourceEmails}
                    </button>
                  )}
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

      {/* Composer */}
      <InputGroup className="mb-2">
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
        <InputGroupAddon align="block-end" className="bg-(--surface,#ffffff)">
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
    </div>
  );
}

interface AgentTabProps {
  onCreditsUsed?: () => void;
}

export function AgentTab({ onCreditsUsed }: AgentTabProps = {}) {
  const { authUser, getIdToken } = useAuth();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>(_persistedMessages);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [clearDrawerOpen, setClearDrawerOpen] = useState(false);
  const [fullPageOpen, setFullPageOpen] = useState(false);
  const [sourceEmailsLogIds, setSourceEmailsLogIds] = useState<string[] | null>(null);
  const [exploreFullscreenEmail, setExploreFullscreenEmail] = useState<{
    subject: string;
    body: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fullPageBottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fullPageChatContainerRef = useRef<HTMLDivElement>(null);

  useModalHistory(fullPageOpen, () => setFullPageOpen(false));

  // Keep module-level cache in sync so it survives tab switches
  useEffect(() => {
    _persistedMessages = messages;
  }, [messages]);

  // Scroll within the container (not the page) when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    if (fullPageChatContainerRef.current) {
      fullPageChatContainerRef.current.scrollTop = fullPageChatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed || loading || !authUser) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    // Capture current messages as history before appending the new user message
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
        onCreditsUsed?.();
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

  const handleOpenSourceEmails = (ids: string[]) => {
    setSourceEmailsLogIds(ids);
  };

  const a = t.dashboard.agent;

  return (
    <div className="space-y-4">
      <Card>
        {/* Header */}
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{a.title}</h2>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullPageOpen(true)}
                aria-label={a.expandFullPage}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
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
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{a.subtitle}</p>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 px-3 py-3 sm:px-4">
          <ChatContent
            messages={messages}
            loading={loading}
            query={query}
            setQuery={setQuery}
            handleSubmit={handleSubmit}
            handleKeyDown={handleKeyDown}
            bottomRef={bottomRef}
            chatContainerRef={chatContainerRef}
            a={a}
            onOpenSourceEmails={handleOpenSourceEmails}
          />
        </CardContent>
      </Card>

      {/* Full-page dialog */}
      <Dialog
        open={fullPageOpen}
        onOpenChange={(o) => {
          if (!o) setFullPageOpen(false);
        }}
      >
        <DialogContent
          hideCloseButton
          animation="slide-from-bottom"
          className="w-[95vw] max-w-4xl h-[92vh] flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
        >
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 pt-4 pb-0 gap-0">
            <ChatContent
              messages={messages}
              loading={loading}
              query={query}
              setQuery={setQuery}
              handleSubmit={handleSubmit}
              handleKeyDown={handleKeyDown}
              bottomRef={fullPageBottomRef}
              chatContainerRef={fullPageChatContainerRef}
              a={a}
              heightClass="flex-1 min-h-0"
              wrapperClass="flex-1 min-h-0 overflow-hidden"
              onOpenSourceEmails={handleOpenSourceEmails}
            />
          </div>
          <DialogFooter className="shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
            <DialogTitle className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {a.sendHint}
            </DialogTitle>
            <DialogClose asChild>
              <Button size="sm" className="shrink-0">
                {a.closeFullPage}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Source emails modal — multiple emails from a single agent response */}
      {sourceEmailsLogIds && sourceEmailsLogIds.length > 0 && (
        <ExploreEmailsModal
          term={null}
          category=""
          categoryLabel=""
          logIds={sourceEmailsLogIds}
          sourceTitle={a.sourceEmails}
          onClose={() => setSourceEmailsLogIds(null)}
          onRequestFullscreen={setExploreFullscreenEmail}
        />
      )}

      {/* Full-page view stacked above ExploreEmailsModal */}
      <FullPageEmailDialog
        open={!!exploreFullscreenEmail}
        onClose={() => setExploreFullscreenEmail(null)}
        subject={exploreFullscreenEmail?.subject ?? ''}
        body={exploreFullscreenEmail?.body ?? null}
        overlayClassName="z-[100]"
        contentClassName="z-[100]"
      />
    </div>
  );
}
