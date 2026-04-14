'use client';

import { useRef, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogClose,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Trash2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/Drawer';
import { useI18n } from '@/lib/i18n';
import { useModalHistory } from '@/hooks/useModalHistory';
import { useAgentChat } from '@/lib/agent-chat';
import { AgentChatContent } from '@/components/dashboard/AgentChatContent';

interface AgentFullPageModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Full-page agent chat dialog rendered at the root of the app via GlobalModalsProvider.
 * Shares all chat state with the AgentTab card through AgentChatContext.
 */
export function AgentFullPageModal({ open, onClose }: AgentFullPageModalProps) {
  const { t } = useI18n();
  const a = t.dashboard.agent;
  const { messages, loading, clearMessages } = useAgentChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [clearDrawerOpen, setClearDrawerOpen] = useState(false);

  const handleClearConfirm = () => {
    clearMessages();
    setClearDrawerOpen(false);
  };

  useModalHistory(open, onClose);

  // Scroll to bottom in the full-page container when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent
          hideCloseButton
          animation="slide-from-bottom"
          className="w-screen h-screen max-w-5xl flex flex-col p-0 overflow-hidden gap-0"
          aria-describedby={undefined}
        >
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 pt-4 pb-0 gap-0">
            <AgentChatContent
              bottomRef={bottomRef}
              chatContainerRef={chatContainerRef}
              heightClass="flex-1 min-h-0"
              wrapperClass="flex-1 min-h-0 overflow-hidden"
            />
          </div>
          <DialogFooter className="shrink-0 px-6 py-6 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-row items-center justify-between gap-2">
            {/* Left actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setClearDrawerOpen(true)}
                disabled={messages.length === 0 || loading}
                aria-label={a.clearConversation}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {/* Right actions */}
            <div className="flex items-center gap-3 shrink-0">
              <DialogTitle className="text-sm font-medium text-gray-400 dark:text-gray-600 truncate">
                {a.sendHint}
              </DialogTitle>
              <DialogClose asChild>
                <Button size="sm" className="shrink-0">
                  {a.closeFullPage}
                </Button>
              </DialogClose>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
