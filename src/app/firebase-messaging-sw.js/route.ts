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

// ─── PWA Caching ────────────────────────────────────────────────────────────

const CACHE_VERSION = 'v2';
const STATIC_CACHE = 'postino-static-' + CACHE_VERSION;
const PAGES_CACHE  = 'postino-pages-'  + CACHE_VERSION;
const ALL_CACHES   = [STATIC_CACHE, PAGES_CACHE];

// Static public assets that are safe to cache long-term.
// These are also pre-cached at install time for instant availability.
const STATIC_ASSET_PATHS = [
  '/favicon.ico',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
  '/manifest.json',
  '/logo.svg',
  '/icon0.svg',
  '/icon1.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSET_PATHS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('postino-') && !ALL_CACHES.includes(n))
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Cache-first: return the cached response immediately; fetch and cache on miss.
 * Ideal for immutable or long-lived assets (hashed JS/CSS, icons).
 */
const cacheFirst = (request, cacheName) =>
  caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
    })
  );

/**
 * Stale-while-revalidate: return cached response instantly (if available) while
 * updating the cache from the network in the background.
 * Ideal for navigation pages — the UI appears immediately, data refreshes silently.
 */
const staleWhileRevalidate = (request, cacheName) =>
  caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      // Return the cached response right away; network update runs in the background.
      if (cached) {
        networkFetch.catch((err) => console.warn('[SW] Background revalidation failed:', err));
        return cached;
      }
      return networkFetch;
    })
  );

const SW_SCRIPT_PATH = '/firebase-messaging-sw.js';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only intercept GET requests.
  if (request.method !== 'GET') return;

  // Only intercept same-origin requests.
  if (url.origin !== self.location.origin) return;

  // Never cache API routes or the service worker script itself.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith(SW_SCRIPT_PATH)) return;

  // Next.js immutable static assets (content-hashed) → cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Next.js page-data requests → stale-while-revalidate.
  if (url.pathname.startsWith('/_next/data/')) {
    event.respondWith(staleWhileRevalidate(request, PAGES_CACHE));
    return;
  }

  // Public static assets (icons, manifest, images) → cache-first.
  if (request.destination === 'image' || STATIC_ASSET_PATHS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests (HTML pages) → stale-while-revalidate.
  // The cached shell is shown instantly; the network response updates it silently.
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request, PAGES_CACHE));
    return;
  }
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
