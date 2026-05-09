/**
 * config/env.ts — Centralized, type-safe environment configuration.
 *
 * Single source of truth for ALL environment variables in the mobile app.
 * Validates at import time and crashes loudly if required vars are missing.
 *
 * Usage:
 *   import { env } from "@/config/env";
 *   console.log(env.apiUrl);       // "https://..."
 *   console.log(env.firebase.apiKey); // "AIza..."
 *   console.log(env.isDev);        // true | false
 *
 * IMPORTANT: Expo inlines EXPO_PUBLIC_* at build time via Babel.
 * Dynamic access like `process.env[variable]` does NOT work.
 * Every env var must be referenced with its full static literal key.
 */

// ─── Raw env reads (static references required by Expo) ──────────────────────

const _apiUrl = process.env.EXPO_PUBLIC_API_URL;
const _appName = process.env.EXPO_PUBLIC_APP_NAME;
const _appEnv = process.env.EXPO_PUBLIC_APP_ENV;

const _firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const _firebaseAuthDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;
const _firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
const _firebaseStorageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
const _firebaseMessagingSenderId = process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
const _firebaseAppId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
const _firebaseMeasurementId = process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID;

// ─── Validation ──────────────────────────────────────────────────────────────

interface RequiredVar {
  name: string;
  value: string | undefined;
}

const required: RequiredVar[] = [
  { name: "EXPO_PUBLIC_API_URL", value: _apiUrl },
  { name: "EXPO_PUBLIC_FIREBASE_API_KEY", value: _firebaseApiKey },
  { name: "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", value: _firebaseAuthDomain },
  { name: "EXPO_PUBLIC_FIREBASE_PROJECT_ID", value: _firebaseProjectId },
  { name: "EXPO_PUBLIC_FIREBASE_APP_ID", value: _firebaseAppId },
];

const missing = required
  .filter((v) => !v.value || v.value.trim().length === 0)
  .map((v) => v.name);

if (missing.length > 0) {
  throw new Error(
    [
      `❌ Missing required environment variables:`,
      ...missing.map((name) => `   • ${name}`),
      ``,
      `Copy .env.example to .env and fill in the values.`,
      `For EAS builds, set these in eas.json env blocks or EAS Secrets.`,
    ].join("\n")
  );
}

// URL format validation
if (_apiUrl && !/^https?:\/\/.+/.test(_apiUrl.trim())) {
  throw new Error(
    `❌ Invalid EXPO_PUBLIC_API_URL: "${_apiUrl}"\n` +
    `   Must start with http:// or https://`
  );
}

// ─── Normalize ───────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// ─── Environment detection ───────────────────────────────────────────────────

type AppEnvironment = "development" | "staging" | "production";

function resolveAppEnv(): AppEnvironment {
  const raw = (_appEnv ?? "development").trim().toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  return "development";
}

// ─── Exported config ─────────────────────────────────────────────────────────

const appEnv = resolveAppEnv();

export const env = {
  /** Backend API base URL (includes /api/v1 prefix). */
  apiUrl: normalizeUrl(_apiUrl!),

  /** Application display name. */
  appName: _appName?.trim() || "SuffaCampus",

  /** Current environment: development | staging | production. */
  appEnv,
  isDev: appEnv === "development",
  isStaging: appEnv === "staging",
  isProd: appEnv === "production",

  /** Firebase configuration. */
  firebase: {
    apiKey: _firebaseApiKey!,
    authDomain: _firebaseAuthDomain!,
    projectId: _firebaseProjectId!,
    storageBucket: _firebaseStorageBucket ?? "",
    messagingSenderId: _firebaseMessagingSenderId ?? "",
    appId: _firebaseAppId!,
    measurementId: _firebaseMeasurementId ?? "",
  },
} as const;

/**
 * Re-export the API base URL for backward compatibility.
 * Prefer `env.apiUrl` in new code.
 */
export const BASE_URL = env.apiUrl;
