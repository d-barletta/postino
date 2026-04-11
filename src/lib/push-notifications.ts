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
  if (typeof window === 'undefined') {
    console.log('[Push] canUseOneSignalOnCurrentOrigin: false — server-side render, no window');
    return false;
  }
  if (isLocalRuntime()) {
    console.log(
      '[Push] canUseOneSignalOnCurrentOrigin: false — local/dev runtime, skipping OneSignal',
    );
    return false;
  }
  if (!ONESIGNAL_APP_ID) {
    console.warn(
      '[Push] canUseOneSignalOnCurrentOrigin: false — NEXT_PUBLIC_ONESIGNAL_APP_ID is not set',
    );
    return false;
  }
  if (!APP_URL) {
    console.warn('[Push] canUseOneSignalOnCurrentOrigin: false — NEXT_PUBLIC_APP_URL is not set');
    return false;
  }

  try {
    const configuredOrigin = new URL(APP_URL).origin;
    const match = window.location.origin === configuredOrigin;
    if (!match) {
      console.warn(
        `[Push] canUseOneSignalOnCurrentOrigin: false — origin mismatch (current: ${window.location.origin}, configured: ${configuredOrigin})`,
      );
    } else {
      console.log(`[Push] canUseOneSignalOnCurrentOrigin: true (origin: ${configuredOrigin})`);
    }
    return match;
  } catch {
    console.error(
      '[Push] canUseOneSignalOnCurrentOrigin: false — failed to parse NEXT_PUBLIC_APP_URL:',
      APP_URL,
    );
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
  console.log('[Push] initOneSignal called');
  cleanupLegacyPushArtifacts();
  if (!canUseOneSignalOnCurrentOrigin()) {
    console.log('[Push] initOneSignal: skipped — canUseOneSignalOnCurrentOrigin returned false');
    return;
  }
  console.log('[Push] initOneSignal: proceeding with SDK initialization');
  void ensureOneSignalInitialized();
}

async function ensureOneSignalInitialized(): Promise<void> {
  if (!canUseOneSignalOnCurrentOrigin()) return;
  const appId = ONESIGNAL_APP_ID;
  if (!appId) return;
  if (!oneSignalInitPromise) {
    console.log('[Push] ensureOneSignalInitialized: creating init promise with appId:', appId);
    oneSignalInitPromise = OneSignal.init({
      appId,
      allowLocalhostAsSecureOrigin: process.env.NODE_ENV === 'development',
    });
  } else {
    console.log('[Push] ensureOneSignalInitialized: init promise already exists, awaiting');
  }
  try {
    await oneSignalInitPromise;
    console.log('[Push] ensureOneSignalInitialized: SDK initialized successfully');
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
  console.log('[Push] subscribeToPushNotifications called, userId:', userId ?? '(none)');
  if (!isPushSupported()) {
    console.warn('[Push] subscribeToPushNotifications: push not supported in this browser');
    return false;
  }
  if (!canUseOneSignalOnCurrentOrigin()) {
    return false;
  }
  try {
    await ensureOneSignalInitialized();
    console.log('[Push] subscribeToPushNotifications: requesting permission');
    const granted = await OneSignal.Notifications.requestPermission();
    console.log('[Push] subscribeToPushNotifications: permission granted:', granted);
    if (granted) {
      await OneSignal.User.PushSubscription.optIn();
      console.log('[Push] subscribeToPushNotifications: opted in successfully');
      if (userId) {
        console.log('[Push] subscribeToPushNotifications: logging in with userId:', userId);
        await OneSignal.login(userId);
        console.log('[Push] subscribeToPushNotifications: login successful');
      }
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
  console.log('[Push] unsubscribeFromPushNotifications called');
  if (!isPushSupported() || !canUseOneSignalOnCurrentOrigin()) return false;
  try {
    await ensureOneSignalInitialized();
    await OneSignal.User.PushSubscription.optOut();
    console.log('[Push] unsubscribeFromPushNotifications: opted out successfully');
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
    if (!oneSignalInitPromise) {
      console.log('[Push] isOneSignalOptedIn: SDK not yet initialized');
      return false;
    }
    const optedIn = OneSignal.User.PushSubscription.optedIn ?? false;
    console.log('[Push] isOneSignalOptedIn:', optedIn);
    return optedIn;
  } catch {
    return false;
  }
}
