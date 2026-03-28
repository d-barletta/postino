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

type DeviceOS = 'ios' | 'android' | 'desktop';
type BrowserType = 'safari' | 'chrome' | 'firefox' | 'samsung' | 'edge' | 'opera' | 'other';

function getDeviceOS(): DeviceOS {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // Detect iPadOS devices (iPadOS 13+ reports Macintosh with multiple touch points)
  if (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  ) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

function getBrowserType(): BrowserType {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/edg\/|edgios|edga\//i.test(ua)) return 'edge';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/opr\/|opt\//i.test(ua)) return 'opera';
  if (/crios/i.test(ua)) return 'chrome'; // Chrome on iOS uses CriOS token — must check before the generic chrome pattern
  if (/chrome|chromium/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua)) return 'safari'; // safe: chrome/samsung/edge checked above
  return 'other';
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

// --- Platform-specific inline icons ---

/**
 * iOS Safari share icon — blue, box with upward-pointing arrow.
 * Matches the Share button in Safari's bottom toolbar.
 */
function IosSafariShareIcon() {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 mx-1 rounded bg-blue-500 text-white align-middle shrink-0">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </span>
  );
}

/**
 * iOS Chrome share icon — dark gray, box with upward-pointing arrow.
 * Matches the Share button in Chrome's top-right toolbar on iOS.
 */
function IosChromeShareIcon() {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 mx-1 rounded bg-gray-700 text-white align-middle shrink-0">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </span>
  );
}

/** Plus icon inside a rounded square. Represents the "Add to Home Screen" action on iOS. */
function AddToHomeScreenIcon() {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 mx-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 align-middle shrink-0">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    </span>
  );
}

/** Three vertical dots. Matches the Chrome / Samsung Internet / Edge / Firefox menu button on Android. */
function ThreeDotsMenuIcon() {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 mx-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 align-middle shrink-0">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3"
        fill="currentColor"
        aria-hidden="true"
      >
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </span>
  );
}

interface InstallPwaDrawerProps {
  /** External signal that can trigger the drawer early (e.g. user enabled notifications). */
  triggerOpen?: boolean;
}

export function InstallPwaDrawer({ triggerOpen = false }: InstallPwaDrawerProps) {
  const { isAvailable, install } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [deviceOS, setDeviceOS] = useState<DeviceOS>('desktop');
  const [browserType, setBrowserType] = useState<BrowserType>('other');
  const { t } = useI18n();
  const tr = t.dashboard.pwaInstall;

  useEffect(() => {
    // All checks are client-only.
    if (isStandalone() || hasDismissed()) return;

    const os = getDeviceOS();
    const browser = getBrowserType();
    setDeviceOS(os);
    setBrowserType(browser);

    // iOS Firefox cannot add to homescreen — skip entirely.
    if (os === 'ios' && browser === 'firefox') return;

    // Show if native prompt is available, or if manual steps can be shown.
    const needsManual = os === 'ios' || (os === 'android' && !isAvailable);
    if (!isAvailable && !needsManual) return;

    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAvailable]);

  // Allow an external trigger (e.g. user just enabled notifications) to open early.
  useEffect(() => {
    if (!triggerOpen || isStandalone() || hasDismissed()) return;
    // iOS Firefox cannot add to homescreen.
    if (deviceOS === 'ios' && browserType === 'firefox') return;
    const needsManual = deviceOS === 'ios' || (deviceOS === 'android' && !isAvailable);
    if (!isAvailable && !needsManual) return;
    setOpen(true);
  }, [triggerOpen, isAvailable, deviceOS, browserType]);

  const handleDismiss = () => {
    saveDismissed();
    setOpen(false);
  };

  const handleInstall = async () => {
    await install();
    setOpen(false);
  };

  // iOS Firefox cannot add to homescreen — nothing to render.
  const isManualIos = deviceOS === 'ios' && browserType !== 'firefox';
  const isManualAndroid = deviceOS === 'android' && !isAvailable;

  // Nothing to render on unsupported environments.
  if (!isAvailable && !isManualIos && !isManualAndroid) return null;

  // iOS Chrome (CriOS) has its share button at the top-right; all other iOS browsers use the bottom toolbar.
  const iosChromeVariant = isManualIos && browserType === 'chrome';

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

        {/* iOS manual instructions */}
        {isManualIos && (
          <div className="px-4 pb-2 space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-900 dark:text-gray-100">{tr.howToTitle}</p>
            <ol className="list-decimal list-inside space-y-1.5">
              {iosChromeVariant ? (
                // iOS Chrome: dark-gray share icon in the upper-right corner
                <>
                  <li>
                    {tr.iosChromeStep1Pre}
                    <IosChromeShareIcon />
                    {tr.iosChromeStep1Post}
                  </li>
                  <li>
                    {tr.iosChromeStep2Pre}{' '}
                    <AddToHomeScreenIcon />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{tr.iosChromeStep2Bold}</span>
                    {tr.iosChromeStep2Post}
                  </li>
                  <li>{tr.iosChromeStep3}</li>
                </>
              ) : (
                // iOS Safari / Edge / Opera: blue share icon in the bottom toolbar
                <>
                  <li>
                    {tr.iosSafariStep1Pre}
                    <IosSafariShareIcon />
                    {tr.iosSafariStep1Post}
                  </li>
                  <li>
                    {tr.iosSafariStep2Pre}{' '}
                    <AddToHomeScreenIcon />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{tr.iosSafariStep2Bold}</span>
                  </li>
                  <li>{tr.iosSafariStep3}</li>
                </>
              )}
            </ol>
          </div>
        )}

        {/* Android manual instructions (when beforeinstallprompt is not available).
            All Android browsers (Chrome, Samsung, Edge, Firefox) use the ⋮ three-dot menu. */}
        {isManualAndroid && (
          <div className="px-4 pb-2 space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-900 dark:text-gray-100">{tr.howToTitle}</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>
                {tr.androidStep1Pre}
                <ThreeDotsMenuIcon />
                {tr.androidStep1Post}
              </li>
              <li>
                {tr.androidStep2Pre}{' '}
                <span className="font-medium text-gray-900 dark:text-gray-100">{tr.androidStep2Bold}</span>
              </li>
              <li>{tr.androidStep3}</li>
            </ol>
          </div>
        )}

        <DrawerFooter>
          {isAvailable && (
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
