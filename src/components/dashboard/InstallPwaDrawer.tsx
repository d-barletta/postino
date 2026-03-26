'use client';

import { useState, useEffect } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';

const DISMISSED_KEY = 'postino_pwa_install_dismissed';
const SHOW_DELAY_MS = 15_000;

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function hasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, 'true');
  } catch {
    // ignore
  }
}

interface InstallPwaDrawerProps {
  /** External signal that can trigger the drawer early (e.g. user enabled notifications). */
  triggerOpen?: boolean;
}

export function InstallPwaDrawer({ triggerOpen = false }: InstallPwaDrawerProps) {
  const { isAvailable, install } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    // All checks are client-only.
    if (isStandalone() || hasDismissed()) return;

    const onIos = isIOS();
    setIos(onIos);

    // Show only if there is something to display: native prompt available OR iOS fallback.
    if (!isAvailable && !onIos) return;

    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAvailable]);

  // Allow an external trigger (e.g. user just enabled notifications) to open early.
  useEffect(() => {
    if (!triggerOpen || isStandalone() || hasDismissed()) return;
    if (!isAvailable && !ios) return;
    setOpen(true);
  }, [triggerOpen, isAvailable, ios]);

  const handleDismiss = () => {
    saveDismissed();
    setOpen(false);
  };

  const handleInstall = async () => {
    await install();
    setOpen(false);
  };

  // Nothing to render on unsupported environments.
  if (!isAvailable && !ios) return null;

  return (
    <Drawer open={open} onOpenChange={(value) => { if (!value) handleDismiss(); }}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add Postino to your home screen</DrawerTitle>
          <DrawerDescription>
            Get faster access and a better experience by installing the app on your device.
          </DrawerDescription>
        </DrawerHeader>

        {ios ? (
          <div className="px-4 pb-2 space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-900 dark:text-gray-100">To install on iOS:</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                Tap the{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">Share</span>{' '}
                button (the box with an arrow pointing up) in the browser toolbar.
              </li>
              <li>
                Scroll down and tap{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  &ldquo;Add to Home Screen&rdquo;
                </span>
                .
              </li>
              <li>Tap &ldquo;Add&rdquo; in the top-right corner to confirm.</li>
            </ol>
          </div>
        ) : null}

        <DrawerFooter>
          {!ios && isAvailable && (
            <Button onClick={handleInstall} className="w-full">
              Install app
            </Button>
          )}
          <Button variant="outline" onClick={handleDismiss} className="w-full">
            Not now
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
