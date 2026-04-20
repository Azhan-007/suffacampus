// SuffaCampus Service Worker - static asset caching only.
// Navigation requests are always network-first to avoid stale HTML/chunk references.
const CACHE_NAME = 'SuffaCampus-v4';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];
const IS_LOCALHOST =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === '[::1]';

function parsePushPayload(event) {
  if (!event.data) return {};

  try {
    return event.data.json();
  } catch (_) {
    return {};
  }
}

function isStaticAssetPath(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png'
  );
}

function isCacheableResponse(response) {
  return Boolean(response) && response.ok && response.type === 'basic';
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install - pre-cache core static assets
self.addEventListener('install', (event) => {
  if (IS_LOCALHOST) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  if (IS_LOCALHOST) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .then(() => self.registration.unregister())
    );
    return;
  }

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch handling
self.addEventListener('fetch', (event) => {
  if (IS_LOCALHOST) return;

  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Work around Chrome's only-if-cached + cross-origin requests.
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // API calls should always prefer network.
  // A cache fallback is retained only for temporary offline resilience.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Do not intercept cross-origin traffic (Firebase, analytics, etc.).
  if (url.origin !== self.location.origin) return;

  // Always fetch navigation requests from network to avoid stale HTML after deploy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () => new Response('Offline', { status: 503, statusText: 'Offline' })
      )
    );
    return;
  }

  // Cache-first for versioned/static app assets.
  if (isStaticAssetPath(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((res) => {
            if (isCacheableResponse(res)) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // For all other same-origin GET requests, use network first and cache successful responses.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (isCacheableResponse(res)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
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

