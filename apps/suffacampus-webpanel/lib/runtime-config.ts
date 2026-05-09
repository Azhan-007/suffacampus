/**
 * lib/runtime-config.ts — Centralized, type-safe environment configuration.
 *
 * Single source of truth for ALL public environment variables in the webpanel.
 * Validates at import time and crashes loudly if required vars are missing.
 *
 * Usage:
 *   import { env } from "@/lib/runtime-config";
 *   console.log(env.apiUrl);    // "https://..."
 *   console.log(env.isDev);     // true | false
 *
 *   // Backward-compatible named export (used in 4+ files):
 *   import { PUBLIC_API_URL } from "@/lib/runtime-config";
 */

// ─── Raw env reads ───────────────────────────────────────────────────────────
// Next.js only inlines process.env.* with literal string keys at build time.
// Dynamic access like process.env[variable] does NOT work.

const _apiUrl = process.env.NEXT_PUBLIC_API_URL;
const _appName = process.env.NEXT_PUBLIC_APP_NAME;
const _appEnv = process.env.NEXT_PUBLIC_APP_ENV;

// ─── Validation ──────────────────────────────────────────────────────────────

interface RequiredVar {
  name: string;
  value: string | undefined;
}

const required: RequiredVar[] = [
  { name: "NEXT_PUBLIC_API_URL", value: _apiUrl },
];

const missing = required
  .filter((v) => !v.value || v.value.trim().length === 0)
  .map((v) => v.name);

if (missing.length > 0) {
  const errorMessage = [
    `❌ Missing required environment variables:`,
    ...missing.map((name) => `   • ${name}`),
    ``,
    `Ensure .env.local has these variables and restart the dev server.`,
    `For Netlify/Vercel deploys, set them in the hosting dashboard.`,
  ].join("\n");

  // In production, crash immediately. In dev, log loudly but allow recovery
  // during SSR where env may not yet be loaded.
  if (process.env.NODE_ENV === "production") {
    throw new Error(errorMessage);
  }

  console.error(errorMessage);
}

// URL format validation
if (_apiUrl && !/^https?:\/\/.+/.test(_apiUrl.trim())) {
  throw new Error(
    `❌ Invalid NEXT_PUBLIC_API_URL: "${_apiUrl}"\n` +
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
  const raw = (_appEnv ?? process.env.NODE_ENV ?? "development")
    .trim()
    .toLowerCase();
  if (raw === "production" || raw === "prod") return "production";
  if (raw === "staging" || raw === "stage") return "staging";
  return "development";
}

// ─── Exported config ─────────────────────────────────────────────────────────

const appEnv = resolveAppEnv();

export const env = {
  /** Backend API base URL (includes /api/v1 prefix). */
  apiUrl: _apiUrl ? normalizeUrl(_apiUrl) : "",

  /** Application display name. */
  appName: _appName?.trim() || "SuffaCampus",

  /** Current environment: development | staging | production. */
  appEnv,
  isDev: appEnv === "development",
  isStaging: appEnv === "staging",
  isProd: appEnv === "production",
} as const;

// ─── Backward-compatible exports ─────────────────────────────────────────────
// These named exports are used in 4+ files across the webpanel.
// Prefer `env.apiUrl` in new code.

export const PUBLIC_API_URL = env.apiUrl;

export function getPublicApiUrl(): string {
  return env.apiUrl;
}
