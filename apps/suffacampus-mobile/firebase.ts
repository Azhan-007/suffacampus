/**
 * firebase.ts — Firebase client-side configuration.
 *
 * Architecture rules:
 *  - Firebase Auth MUST remain client-side (used to obtain ID tokens).
 *  - Firestore client SDK has been REMOVED. All data access goes through
 *    the Fastify backend at http://localhost:5000 via services/api.ts.
 */

import { getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";

// ── Env validation ────────────────────────────────────────────────────────────
// NOTE: Expo inlines EXPO_PUBLIC_* at build time via Babel — dynamic access
// like process.env[variable] does NOT work. Use static references only.
const _apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const _authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const _projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const _appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

const missingVars: string[] = [];
if (!_apiKey) missingVars.push("EXPO_PUBLIC_FIREBASE_API_KEY");
if (!_authDomain) missingVars.push("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN");
if (!_projectId) missingVars.push("EXPO_PUBLIC_FIREBASE_PROJECT_ID");
if (!_appId) missingVars.push("EXPO_PUBLIC_FIREBASE_APP_ID");

if (missingVars.length > 0) {
  throw new Error(
    `Missing required Firebase environment variables:\n  ${missingVars.join("\n  ")}\n\nCopy .env.example to .env and fill in the values.`
  );
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

// Initialize Firebase app only if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth - Expo handles persistence automatically
let authInstance;
try {
  // Try to get existing instance first
  authInstance = getAuth(app);
} catch (error: any) {
  // If not initialized, initialize now
  try {
    authInstance = initializeAuth(app, {});
  } catch (fallbackError: any) {
    if (fallbackError.code !== "auth/already-initialized") {
      throw fallbackError;
    }
    authInstance = getAuth(app);
  }
}

export const auth = authInstance;

