'use client';

import ReactMarkdown from 'react-markdown';
import { Copy, Mail, RotateCcw, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/InputGroup';
import { useI18n } from '@/lib/i18n';
import { useAgentChat } from '@/lib/agent-chat';
import { useGlobalModals } from '@/lib/modals';
import { cn } from '@/lib/utils';
import type { RefObject } from 'react';

interface AgentChatContentProps {
  bottomRef: RefObject<HTMLDivElement | null>;
  chatContainerRef: RefObject<HTMLDivElement | null>;
  heightClass?: string;
  wrapperClass?: string;
}

/**
 * Renders the agent chat UI (message list + composer).
 * Reads all chat state from AgentChatContext via useAgentChat().
 * Source email links open the global ExploreEmailsModal via useGlobalModals().
 * Only per-view UI refs (bottomRef, chatContainerRef) are passed as props.
 */
export function AgentChatContent({
  bottomRef,
  chatContainerRef,
  heightClass = 'h-89',
  wrapperClass = '',
}: AgentChatContentProps) {
  const {
    messages,
    loading,
    streamingContent,
    query,
    setQuery,
    handleSubmit,
    handleKeyDown,
    repeatMessage,
  } = useAgentChat();
  const { openExploreEmails } = useGlobalModals();
  const { t } = useI18n();
  const a = t.dashboard.agent;

  const handleOpenSourceEmails = (ids: string[]) => {
    openExploreEmails({ logIds: ids, sourceTitle: a.sourceEmails });
  };

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
              <div
                className={cn(
                  'flex flex-col gap-1.5',
                  msg.role === 'user' ? 'max-w-[85%]' : 'max-w-[75%]',
                )}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-2.5 text-sm leading-relaxed cursor-pointer select-text',
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
                                if (href?.startsWith('email-ref:')) {
                                  const logId = href.slice('email-ref:'.length);
                                  return (
                                    <button
                                      onClick={() => handleOpenSourceEmails([logId])}
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
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={msg.role === 'user' ? 'end' : 'start'}>
                    <DropdownMenuItem
                      onClick={() =>
                        navigator.clipboard
                          .writeText(msg.content)
                          .then(() => toast.success(a.copyMessage))
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {a.copyLabel}
                    </DropdownMenuItem>
                    {msg.role === 'user' && (
                      <DropdownMenuItem
                        onClick={() => repeatMessage(msg.content)}
                        disabled={loading}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {a.repeatMessage}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {/* Source emails link */}
                {msg.role === 'assistant' &&
                  msg.sourceEmailIds &&
                  msg.sourceEmailIds.length > 0 && (
                    <button
                      onClick={() => handleOpenSourceEmails(msg.sourceEmailIds ?? [])}
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

        {/* Typing indicator — shows streamed text above dots while loading */}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              <PostinoLogo className="h-4 w-4" title={a.title} />
            </div>
            <div className="rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800 max-w-[75%]">
              {streamingContent ? (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1 prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-code:text-xs text-gray-900 dark:text-gray-100 mb-2">
                  <ReactMarkdown>{streamingContent}</ReactMarkdown>
                </div>
              ) : null}
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
