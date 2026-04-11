import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
let oneSignalInitPromise: Promise<void> | null = null;

function isLocalRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    process.env.NODE_ENV !== 'production' ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1'
  );
}

async function cleanupLegacyPushServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    const legacy = regs.filter((r) => r.active?.scriptURL.includes('/firebase-messaging-sw.js'));
    await Promise.all(legacy.map((r) => r.unregister()));
  } catch {
    // Non-fatal cleanup: ignore failures.
  }
}

export function cleanupLegacyPushArtifacts(): void {
  void cleanupLegacyPushServiceWorkers();
}

function canUseOneSignalOnCurrentOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  if (isLocalRuntime()) return false;
  if (!ONESIGNAL_APP_ID) return false;
  if (!APP_URL) return false;

  try {
    const configuredOrigin = new URL(APP_URL).origin;
    return window.location.origin === configuredOrigin;
  } catch {
    return false;
  }
}

/** Returns true when the current environment supports web push notifications. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/** Returns the current browser notification permission, or null when unsupported. */
export function getNotificationPermission(): NotificationPermission | null {
  if (!isPushSupported()) return null;
  return Notification.permission;
}

/**
 * Initializes the OneSignal SDK. Call once at app startup (client-side only).
 */
export function initOneSignal(): void {
  cleanupLegacyPushArtifacts();
  if (!canUseOneSignalOnCurrentOrigin()) return;
  void ensureOneSignalInitialized();
}

async function ensureOneSignalInitialized(): Promise<void> {
  if (!canUseOneSignalOnCurrentOrigin()) return;
  const appId = ONESIGNAL_APP_ID;
  if (!appId) return;
  if (!oneSignalInitPromise) {
    oneSignalInitPromise = OneSignal.init({
      appId,
      serviceWorkerParam: { scope: '/' },
      serviceWorkerPath: '/OneSignalSDKWorker.js',
      allowLocalhostAsSecureOrigin: process.env.NODE_ENV === 'development',
    });
  }
  try {
    await oneSignalInitPromise;
  } catch (err) {
    oneSignalInitPromise = null;
    console.error('[OneSignal] init failed:', err);
    throw err;
  }
}

/**
 * Associates the OneSignal subscription with a specific user ID.
 * Call after the user is authenticated.
 */
/**
 * Requests push notification permission and opts the user in.
 * @returns `true` when permission is granted, `false` otherwise.
 */
export async function subscribeToPushNotifications(userId?: string): Promise<boolean> {
  if (!isPushSupported() || !canUseOneSignalOnCurrentOrigin()) return false;
  try {
    await ensureOneSignalInitialized();
    if (userId) {
      await OneSignal.login(userId);
    }
    const granted = await OneSignal.Notifications.requestPermission();
    if (granted) {
      await OneSignal.User.PushSubscription.optIn();
    }
    return granted;
  } catch (err) {
    console.error('[OneSignal] subscribe failed:', err);
    return false;
  }
}

/**
 * Opts the user out of push notifications without revoking browser permission.
 * @returns `true` when the operation succeeds.
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!isPushSupported() || !canUseOneSignalOnCurrentOrigin()) return false;
  try {
    await ensureOneSignalInitialized();
    await OneSignal.User.PushSubscription.optOut();
    return true;
  } catch (err) {
    console.error('[OneSignal] unsubscribe failed:', err);
    return false;
  }
}

/** Returns whether the user is currently opted in to push notifications. */
export function isOneSignalOptedIn(): boolean {
  if (!canUseOneSignalOnCurrentOrigin()) return false;
  try {
    if (!oneSignalInitPromise) return false;
    return OneSignal.User.PushSubscription.optedIn ?? false;
  } catch {
    return false;
  }
}
