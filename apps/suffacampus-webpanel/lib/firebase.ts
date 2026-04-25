// Firebase Configuration and Initialization
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import {
  getMessaging,
  getToken,
  isSupported,
  type Messaging,
} from 'firebase/messaging';

// --- Firebase config (env vars are inlined at build time by Next.js) ----------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate using the already-resolved static values
// (Next.js only inlines process.env.* with literal keys, not dynamic process.env[k])
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missingKeys.length > 0 && typeof window === 'undefined') {
  const errorMessage = `Missing Firebase config values: ${missingKeys.join(', ')}.\nEnsure .env.local has the NEXT_PUBLIC_FIREBASE_* variables and restart the dev server.`;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(errorMessage);
  }

  console.error(errorMessage);
}

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Firebase services
export const auth: Auth = getAuth(app);

let messagingInstance: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (!(await isSupported())) return null;

  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }

  return messagingInstance;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    return 'denied';
  }

  return Notification.requestPermission();
}

export async function getFcmToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn('[FCM] Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY');
    return null;
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return null;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) {
    return null;
  }

  try {
    const registration = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.ready
      : undefined;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (error) {
    console.warn('[FCM] Failed to get token:', error);
    return null;
  }
}

export default app;
