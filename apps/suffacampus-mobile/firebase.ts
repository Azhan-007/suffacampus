/**
 * firebase.ts — Firebase client-side configuration.
 *
 * Architecture rules:
 *  - Firebase Auth MUST remain client-side (used to obtain ID tokens).
 *  - Firestore client SDK has been REMOVED. All data access goes through
 *    the Fastify backend URL configured in EXPO_PUBLIC_API_URL via services/api.ts.
 */

import { getApps, initializeApp } from "firebase/app";
// @ts-ignore: getReactNativePersistence exists at runtime but is missing from Firebase v12 type definitions
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { env } from "./config/env";

// ── Firebase config (validated by config/env.ts at import time) ───────────────

const firebaseConfig = {
  apiKey: env.firebase.apiKey,
  authDomain: env.firebase.authDomain,
  projectId: env.firebase.projectId,
  storageBucket: env.firebase.storageBucket,
  messagingSenderId: env.firebase.messagingSenderId,
  appId: env.firebase.appId,
  measurementId: env.firebase.measurementId,
};

// Initialize Firebase app only if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth with AsyncStorage persistence so login survives app restarts
let authInstance;
try {
  // Try to get existing instance first (hot reload safety)
  authInstance = getAuth(app);
} catch (error: any) {
  // If not initialized, initialize with persistence
  try {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch (fallbackError: any) {
    if (fallbackError.code !== "auth/already-initialized") {
      throw fallbackError;
    }
    authInstance = getAuth(app);
  }
}

export const auth = authInstance;
