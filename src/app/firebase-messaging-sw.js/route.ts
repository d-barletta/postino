import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Serves the Firebase Cloud Messaging service worker as a dynamic route so that
 * Firebase client config values (which are Next.js NEXT_PUBLIC_ env vars) can be
 * embedded into the service worker script at request time without needing a static
 * build step.
 *
 * The service worker is registered at the root scope (`/`) so that it can intercept
 * push messages for the entire application.  The `Service-Worker-Allowed: /` header
 * grants that expanded scope even though the script URL path is
 * `/firebase-messaging-sw.js`.
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  };

  const swContent = `importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  // All notification content is carried in payload.data (data-only message) so that
  // the browser does not auto-display a notification from the notification field and
  // then have the service worker show a second one — which would cause duplicates.
  var data = payload.data || {};
  var notificationTitle = data.title || (payload.notification && payload.notification.title) || 'New Email';
  var notificationOptions = {
    body: data.body || (payload.notification && payload.notification.body) || '',
    icon: data.icon || (payload.notification && payload.notification.icon) || '/web-app-manifest-192x192.png',
    badge: data.badge || '/favicon-96x96.png',
    tag: data.tag || 'postino-email',
    data: payload.data || {},
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/dashboard';
  var absoluteUrl = new URL(url, self.location.origin).toString();

  // Broadcast a refresh signal to any open app window so that the email list
  // is reloaded immediately when the user returns to (or stays on) the dashboard.
  try {
    var bc = new BroadcastChannel('postino-refresh');
    bc.postMessage({ type: 'EMAIL_NOTIFICATION_CLICK' });
    bc.close();
  } catch (e) {
    // BroadcastChannel not supported — dashboard will refresh on next visibility change.
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Reuse an existing app window when possible, but navigate it to the target URL.
      if (windowClients.length > 0) {
        var client = windowClients[0];
        if ('navigate' in client) {
          return client.navigate(absoluteUrl).then(function(navigatedClient) {
            return navigatedClient ? navigatedClient.focus() : client.focus();
          });
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    })
  );
});
`;

  return new NextResponse(swContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
