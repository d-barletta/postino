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
import { PostinoLogo } from '@/components/brand/PostinoLogo';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  const tr = t.dashboard.pwaInstall;

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
          <div className="flex justify-center mb-2">
            <PostinoLogo className="h-12 w-12" />
          </div>
          <DrawerTitle>{tr.title}</DrawerTitle>
          <DrawerDescription>
            {tr.description}
          </DrawerDescription>
        </DrawerHeader>

        {ios ? (
          <div className="px-4 pb-2 space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-900 dark:text-gray-100">{tr.iosTitle}</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                {tr.iosStep1Pre}{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">{tr.iosStep1Bold}</span>{' '}
                {tr.iosStep1Post}
              </li>
              <li>
                {tr.iosStep2Pre}{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">{tr.iosStep2Bold}</span>.
              </li>
              <li>{tr.iosStep3}</li>
            </ol>
          </div>
        ) : null}

        <DrawerFooter>
          {!ios && isAvailable && (
            <Button onClick={handleInstall} className="w-full">
              {tr.installButton}
            </Button>
          )}
          <Button variant="outline" onClick={handleDismiss} className="w-full">
            {tr.notNow}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
