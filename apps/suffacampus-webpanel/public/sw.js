// SuffaCampus Service Worker â€” offline shell + API cache
const CACHE_NAME = 'SuffaCampus-v1';
const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.json',
];

function parsePushPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch (_) {
    return {};
  }
}

// Install â€” pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate â€” clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch â€” network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls â†’ network-first with short cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets & pages â†’ stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return res;
      });
      return cached || fetchPromise;
    })
  );
});

// Background push notifications (FCM/web push payloads)
self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || 'SuffaCampus';
  const body = notification.body || data.body || 'You have a new notification.';
  const actionUrl = data.actionUrl || data.link || '/notifications';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: {
        actionUrl,
        notificationId: data.notificationId || null,
      },
      tag: data.notificationId || undefined,
      renotify: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const actionUrl = event.notification.data?.actionUrl || '/notifications';
  const targetUrl = new URL(actionUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});

