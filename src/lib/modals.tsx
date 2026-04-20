'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { FullPageEmailDialog } from '@/components/dashboard/FullPageEmailDialog';
import { ExploreEmailsModal } from '@/components/dashboard/ExploreEmailsModal';
import { AgentFullPageModal } from '@/components/dashboard/AgentFullPageModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FullPageEmailState {
  subject: string;
  body: string | null;
  processedBody?: string | null;
  initialShowRewritten?: boolean;
  loading: boolean;
}

export interface ExploreEmailsOptions {
  term?: string | null;
  category?: string;
  categoryLabel?: string;
  aliases?: string[];
  logIds?: string[];
  sourceTitle?: string;
}

interface ModalsContextValue {
  // FullPageEmailDialog
  openFullPageEmail: (opts: {
    subject: string;
    body: string | null;
    processedBody?: string | null;
    initialShowRewritten?: boolean;
    loading?: boolean;
  }) => void;
  updateFullPageEmail: (
    opts: Partial<{
      subject: string;
      body: string | null;
      processedBody: string | null;
      loading: boolean;
    }>,
  ) => void;
  closeFullPageEmail: () => void;
  fullPageEmailOpen: boolean;

  // ExploreEmailsModal
  openExploreEmails: (opts: ExploreEmailsOptions) => void;
  closeExploreEmails: () => void;

  // Agent full-page modal
  openAgentFullPage: () => void;
  closeAgentFullPage: () => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ModalsContext = createContext<ModalsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GlobalModalsProvider({ children }: { children: ReactNode }) {
  // FullPageEmailDialog state
  const [fullPageEmail, setFullPageEmail] = useState<FullPageEmailState | null>(null);

  // ExploreEmailsModal state
  const [exploreEmails, setExploreEmails] = useState<ExploreEmailsOptions | null>(null);
  const [exploreClosing, setExploreClosing] = useState(false);

  // Agent full-page modal state
  const [agentFullPageOpen, setAgentFullPageOpen] = useState(false);

  // -----------------------------------------------------------------------
  // FullPageEmailDialog actions
  // -----------------------------------------------------------------------

  const openFullPageEmail = useCallback(
    (opts: {
      subject: string;
      body: string | null;
      processedBody?: string | null;
      initialShowRewritten?: boolean;
      loading?: boolean;
    }) => {
      setFullPageEmail({
        subject: opts.subject,
        body: opts.body,
        processedBody: opts.processedBody,
        initialShowRewritten: opts.initialShowRewritten ?? false,
        loading: opts.loading ?? false,
      });
    },
    [],
  );

  const updateFullPageEmail = useCallback(
    (opts: Partial<{ subject: string; body: string | null; loading: boolean }>) => {
      setFullPageEmail((prev) => (prev ? { ...prev, ...opts } : null));
    },
    [],
  );

  const closeFullPageEmail = useCallback(() => {
    setFullPageEmail(null);
  }, []);

  // -----------------------------------------------------------------------
  // ExploreEmailsModal actions
  // -----------------------------------------------------------------------

  const openExploreEmails = useCallback((opts: ExploreEmailsOptions) => {
    setExploreEmails(opts);
  }, []);

  const closeExploreEmails = useCallback(() => {
    // Set closing flag to trigger the slide-out animation in the modal while keeping it mounted.
    // After the animation completes (500ms), unmount the component entirely.
    setExploreClosing(true);
    setTimeout(() => {
      setExploreEmails(null);
      setExploreClosing(false);
    }, 520);
  }, []);

  // -----------------------------------------------------------------------
  // Agent full-page modal actions
  // -----------------------------------------------------------------------

  const openAgentFullPage = useCallback(() => setAgentFullPageOpen(true), []);
  const closeAgentFullPage = useCallback(() => setAgentFullPageOpen(false), []);

  // -----------------------------------------------------------------------
  // Derive ExploreEmailsModal props
  // -----------------------------------------------------------------------

  return (
    <ModalsContext.Provider
      value={{
        openFullPageEmail,
        updateFullPageEmail,
        closeFullPageEmail,
        fullPageEmailOpen: !!fullPageEmail,
        openExploreEmails,
        closeExploreEmails,
        openAgentFullPage,
        closeAgentFullPage,
      }}
    >
      {children}

      {/* ------------------------------------------------------------------ */}
      {/* Global modal: ExploreEmailsModal (email log list)                   */}
      {/* ------------------------------------------------------------------ */}
      {exploreEmails && (
        <ExploreEmailsModal
          term={exploreClosing ? null : (exploreEmails.term ?? null)}
          category={exploreEmails.category ?? ''}
          categoryLabel={exploreEmails.categoryLabel ?? ''}
          aliases={exploreEmails.aliases}
          logIds={exploreClosing ? undefined : exploreEmails.logIds}
          sourceTitle={exploreEmails.sourceTitle}
          onClose={closeExploreEmails}
          onRequestFullscreen={(email) =>
            openFullPageEmail({
              subject: email.subject,
              body: email.body,
              processedBody: email.processedBody,
              initialShowRewritten: email.initialShowRewritten,
              loading: email.loading ?? false,
            })
          }
          onUpdateFullscreen={(update) => updateFullPageEmail(update)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Global modal: FullPageEmailDialog                                   */}
      {/* Rendered above ExploreEmailsModal with higher z-index.             */}
      {/* ------------------------------------------------------------------ */}
      <FullPageEmailDialog
        open={!!fullPageEmail}
        onClose={closeFullPageEmail}
        subject={fullPageEmail?.subject ?? ''}
        body={fullPageEmail?.body ?? null}
        processedBody={fullPageEmail?.processedBody ?? null}
        initialShowRewritten={fullPageEmail?.initialShowRewritten ?? false}
        loading={fullPageEmail?.loading}
        overlayClassName="z-[100]"
        contentClassName="z-[100]"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Global modal: Agent full-page chat                                  */}
      {/* ------------------------------------------------------------------ */}
      <AgentFullPageModal open={agentFullPageOpen} onClose={closeAgentFullPage} />
    </ModalsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGlobalModals(): ModalsContextValue {
  const ctx = useContext(ModalsContext);
  if (!ctx) throw new Error('useGlobalModals must be used within GlobalModalsProvider');
  return ctx;
}
