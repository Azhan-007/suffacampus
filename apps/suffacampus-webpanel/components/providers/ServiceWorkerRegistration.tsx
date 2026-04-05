'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

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
