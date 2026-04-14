'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/Drawer';
import { useI18n } from '@/lib/i18n';
import { Trash2, Maximize2 } from 'lucide-react';
import { AgentChatContent } from '@/components/dashboard/AgentChatContent';
import { useAgentChat } from '@/lib/agent-chat';
import { useGlobalModals } from '@/lib/modals';

interface AgentTabProps {
  onCreditsUsed?: () => void;
}

export function AgentTab({ onCreditsUsed }: AgentTabProps) {
  const { t } = useI18n();
  const { messages, clearMessages, registerCreditsCallback } = useAgentChat();
  const { openAgentFullPage } = useGlobalModals();
  const [clearDrawerOpen, setClearDrawerOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Register the credits callback so the context can call it on successful responses
  useEffect(() => {
    if (onCreditsUsed) registerCreditsCallback(onCreditsUsed);
  }, [onCreditsUsed, registerCreditsCallback]);

  // Scroll within the card container when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleClearConfirm = () => {
    clearMessages();
    setClearDrawerOpen(false);
  };

  const a = t.dashboard.agent;

  return (
    <div className="space-y-4">
      <Card>
        {/* Header */}
        <CardHeader
          heading={a.title}
          actions={
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={openAgentFullPage}
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
            </>
          }
        />

        <CardContent className="flex flex-col gap-3 px-3 py-3 sm:px-4">
          <AgentChatContent bottomRef={bottomRef} chatContainerRef={chatContainerRef} />
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
