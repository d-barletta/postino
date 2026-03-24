import { getMessaging, getToken, onMessage, deleteToken } from 'firebase/messaging';
import type { Unsubscribe } from 'firebase/messaging';
import app from '@/lib/firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

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
 * Registers the FCM service worker, requests notification permission, retrieves the
 * FCM registration token, and persists it to the server.
 *
 * @param getIdToken - Async function that returns a Firebase ID token for the current user.
 * @returns `true` when the subscription succeeds, `false` otherwise.
 */
export async function subscribeToPushNotifications(
  getIdToken: () => Promise<string>
): Promise<boolean> {
  if (!isPushSupported() || !app || !VAPID_KEY) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;

    const idToken = await getIdToken();
    const res = await fetch('/api/push/register', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fcmToken: token }),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to subscribe to push notifications:', err);
    return false;
  }
}

/**
 * Deletes the current FCM token and removes it from the server.
 *
 * @param getIdToken - Async function that returns a Firebase ID token for the current user.
 * @returns `true` when the unsubscription succeeds, `false` otherwise.
 */
export async function unsubscribeFromPushNotifications(
  getIdToken: () => Promise<string>
): Promise<boolean> {
  if (!isPushSupported() || !app || !VAPID_KEY) return false;

  try {
    // We need the current token before deleting it so we can remove it from the server.
    const registrations = await navigator.serviceWorker.getRegistrations();
    const swRegistration = registrations.find((r) => r.active?.scriptURL.includes('firebase-messaging-sw'));

    const messaging = getMessaging(app);
    let currentToken: string | null = null;
    try {
      currentToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
      });
    } catch {
      // Token may already be invalid – proceed with deleteToken anyway.
    }

    await deleteToken(messaging);

    if (currentToken) {
      const idToken = await getIdToken();
      await fetch('/api/push/register', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fcmToken: currentToken }),
      });
    }
    return true;
  } catch (err) {
    console.error('Failed to unsubscribe from push notifications:', err);
    return false;
  }
}

/**
 * Listens for FCM messages while the app is in the foreground and shows a browser
 * notification for each one (mirrors the background handler in the service worker).
 *
 * @returns An unsubscribe function, or `null` when not supported.
 */
export function setupForegroundMessageHandler(): Unsubscribe | null {
  if (!app || typeof window === 'undefined') return null;

  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? 'New Email';
      const options: NotificationOptions = {
        body: payload.notification?.body ?? '',
        icon: payload.notification?.icon ?? '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        tag: 'postino-email',
        data: payload.data ?? {},
      };

      // Prefer showing via the service worker so the notification looks identical
      // to background notifications (supports actions, badge, etc.).
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, options))
          .catch(() => {
            if (Notification.permission === 'granted') new Notification(title, options);
          });
      } else if (Notification.permission === 'granted') {
        new Notification(title, options);
      }
    });
  } catch (err) {
    console.error('Failed to set up foreground message handler:', err);
    return null;
  }
}
