'use client';

import { useEffect, useRef } from 'react';

/**
 * Module-level stack of "back" handlers.
 * Each open modal/drawer/dialog pushes one entry; the back button pops the top.
 */
const backHandlers: Array<() => void> = [];

/**
 * Count of phantom history entries left by modals that were closed
 * programmatically (not via the back button). When the user presses Back and
 * there are no open modals to close, we skip these phantom entries so that the
 * back button reaches the real previous page in a single press.
 */
let phantomCount = 0;

function handleGlobalPopState(): void {
  const handler = backHandlers.pop();
  if (handler) {
    handler();
    return;
  }
  // No open modal to close — this popstate hit a phantom entry that was left
  // behind when a modal was closed programmatically. Skip it so the user
  // reaches their actual previous page.
  if (phantomCount > 0) {
    phantomCount--;
    window.history.back();
  }
}

// Register the single global listener when the module is first loaded in the browser.
// The symbol prevents double-registration in dev hot-reload scenarios.
const LISTENER_KEY = '__postinoModalHistoryAttached__';
if (
  typeof window !== 'undefined' &&
  !(window as unknown as Record<string, unknown>)[LISTENER_KEY]
) {
  (window as unknown as Record<string, unknown>)[LISTENER_KEY] = true;
  window.addEventListener('popstate', handleGlobalPopState);
}

/**
 * Integrates a modal, drawer, or dialog with browser history so that the
 * Back button closes the overlay instead of navigating away from the page.
 *
 * - When `isOpen` becomes `true` a history entry is pushed.
 * - When the user presses Back the `onBack` callback is invoked.
 * - When `isOpen` becomes `false` (programmatic close) the phantom history
 *   entry is noted and skipped transparently on the next back-button press.
 *
 * Multiple concurrent overlays are supported via a LIFO stack: the topmost
 * overlay is always closed first.
 */
export function useModalHistory(isOpen: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Keep a stable reference to the specific handler we push so we can remove
  // exactly our entry even when multiple modals are open simultaneously.
  const handlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handler = () => onBackRef.current();
    handlerRef.current = handler;

    backHandlers.push(handler);
    window.history.pushState({ postinoModal: backHandlers.length }, '');

    return () => {
      const idx = backHandlers.indexOf(handler);
      if (idx !== -1) {
        // The modal was closed programmatically (not via the back button).
        // Remove our handler and record the orphaned phantom history entry.
        // We intentionally do NOT call history.back() here: doing so fires a
        // popstate event that Next.js intercepts and treats as a navigation,
        // which would unexpectedly take the user to the previous page.
        // Instead, phantomCount is decremented in handleGlobalPopState the
        // next time the user presses Back, transparently skipping the phantom.
        backHandlers.splice(idx, 1);
        phantomCount++;
      }
      // If idx === -1 the handler was already removed by handleGlobalPopState,
      // meaning the user pressed Back — no cleanup needed.
      handlerRef.current = null;
    };
  }, [isOpen]);
}
