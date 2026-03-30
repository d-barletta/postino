'use client';

import { useEffect, useRef } from 'react';

/**
 * Module-level stack of "back" handlers.
 * Each open modal/drawer/dialog pushes one entry; the back button pops the top.
 */
const backHandlers: Array<() => void> = [];

/**
 * Counter used to ignore popstate events that are triggered programmatically
 * (i.e. when a modal is closed via its own UI and we call history.back() to
 * clean up the phantom history entry we pushed when the modal opened).
 */
let suppressCount = 0;

function handleGlobalPopState(): void {
  if (suppressCount > 0) {
    suppressCount--;
    return;
  }
  const handler = backHandlers.pop();
  if (handler) handler();
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
 *   entry is cleaned up so the back button still works as expected afterward.
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
        // Remove our handler from the stack and go back one step to remove
        // the phantom history entry we pushed when the modal opened.
        backHandlers.splice(idx, 1);
        suppressCount++;
        window.history.back();
      }
      // If idx === -1 the handler was already removed by handleGlobalPopState,
      // meaning the user pressed Back — no cleanup needed.
      handlerRef.current = null;
    };
  }, [isOpen]);
}
