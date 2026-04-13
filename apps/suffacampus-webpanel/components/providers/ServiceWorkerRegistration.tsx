'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Service workers can serve stale assets during local development.
    // Keep SW registration strictly for production builds.
    if (process.env.NODE_ENV !== 'production') {
      const resetFlag = 'suffacampus-sw-dev-reset';
      const hadController = Boolean(navigator.serviceWorker.controller);

      const unregisterPromise = navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));

      const clearCachePromise = 'caches' in window
        ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        : Promise.resolve();

      Promise.all([unregisterPromise, clearCachePromise])
        .then(() => {
          if (hadController && !sessionStorage.getItem(resetFlag)) {
            sessionStorage.setItem(resetFlag, '1');
            window.location.reload();
            return;
          }

          sessionStorage.removeItem(resetFlag);
        })
        .catch((err) => {
          console.warn('[SW] development cleanup failed:', err);
        });

      return;
    }

    // Register after hydration settles
    const timer = setTimeout(() => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          // registered successfully
        })
        .catch((err) => {
          console.warn('[SW] registration failed:', err);
        });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
