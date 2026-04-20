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
    const reloadFlag = 'suffacampus-sw-prod-reload';
    let shouldReloadOnControllerChange = false;
    let removeUpdateFoundListener: (() => void) | null = null;

    const onControllerChange = () => {
      if (!shouldReloadOnControllerChange) return;

      if (sessionStorage.getItem(reloadFlag) === '1') {
        sessionStorage.removeItem(reloadFlag);
        return;
      }

      sessionStorage.setItem(reloadFlag, '1');
      window.location.reload();
    };

    const timer = setTimeout(() => {
      shouldReloadOnControllerChange = Boolean(navigator.serviceWorker.controller);

      const requestSkipWaiting = (registration: ServiceWorkerRegistration) => {
        if (!shouldReloadOnControllerChange) return;
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      };

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          const onUpdateFound = () => {
            const installing = registration.installing;
            if (!installing) return;

            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                requestSkipWaiting(registration);
              }
            });
          };

          registration.addEventListener('updatefound', onUpdateFound);
          removeUpdateFoundListener = () => {
            registration.removeEventListener('updatefound', onUpdateFound);
          };

          if (registration.waiting && navigator.serviceWorker.controller) {
            requestSkipWaiting(registration);
          }

          registration.update().catch(() => {
            // update check failed; keep current worker
          });
        })
        .catch((err) => {
          console.warn('[SW] registration failed:', err);
        });
    }, 2000);

    return () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (removeUpdateFoundListener) removeUpdateFoundListener();
    };
  }, []);

  return null;
}
