import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../firebase";
import Constants from "expo-constants";

// ─── Timeout + Retry Config ─────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000; // 15 seconds
const MAX_RETRIES = 1;
const RETRY_BASE_MS = 500;
const RETRYABLE_STATUSES = new Set([408, 502, 503, 504]);
const DEFAULT_TESTING_API_URL = "https://suffacampus-backend-new.onrender.com/api/v1";
const SESSION_TOKEN_STORAGE_KEY = "SuffaCampus-session-access-token";
const SESSION_TOKEN_UID_STORAGE_KEY = "SuffaCampus-session-access-token-uid";

/**
 * Wraps `fetch` with an AbortController timeout.
 * Throws a descriptive error if the request exceeds `timeoutMs`.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message?.includes("aborted"))
    ) {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with exponential-backoff retry for transient failures.
 * Retries on network errors and status codes 408, 502, 503, 504.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retries = MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);

      // Only retry on retryable server errors (not client errors)
      if (RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // Don't retry if it's already the last attempt
      if (attempt >= retries) break;

      // Retry on network / timeout errors
      await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve API base URL in this priority:
 *  1. EXPO_PUBLIC_API_URL env variable (set in .env or app.json extra)
 *  2. Temporary Render testing fallback
 *
 * The URL MUST include the /api/v1 prefix — all backend routes live there.
 */
export const BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ??
  process.env.EXPO_PUBLIC_API_URL ??
  DEFAULT_TESTING_API_URL;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiFetchOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
}

type SessionTokenCache = {
  uid: string;
  token: string;
};

let sessionTokenCache: SessionTokenCache | null = null;
let inflightSessionPromise: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// JWT expiry helper — avoids wasting a round-trip with an expired token
// ---------------------------------------------------------------------------

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;

    const payloadSegment = parts[1];
    // Base64url → Base64
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as { exp?: number };

    if (typeof payload.exp !== "number") return false; // no exp claim → don't reject
    const nowSeconds = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSeconds;
  } catch {
    return true; // malformed → treat as expired
  }
}

// ---------------------------------------------------------------------------

async function persistSessionAccessToken(uid: string, token: string): Promise<void> {
  sessionTokenCache = { uid, token };
  await AsyncStorage.multiSet([
    [SESSION_TOKEN_STORAGE_KEY, token],
    [SESSION_TOKEN_UID_STORAGE_KEY, uid],
  ]);
}

export async function clearSessionAccessToken(): Promise<void> {
  sessionTokenCache = null;
  await AsyncStorage.multiRemove([
    SESSION_TOKEN_STORAGE_KEY,
    SESSION_TOKEN_UID_STORAGE_KEY,
  ]);
}

async function readStoredSessionAccessToken(uid: string): Promise<string | null> {
  const pairs = await AsyncStorage.multiGet([
    SESSION_TOKEN_STORAGE_KEY,
    SESSION_TOKEN_UID_STORAGE_KEY,
  ]);

  const token = pairs[0]?.[1] ?? null;
  const storedUid = pairs[1]?.[1] ?? null;

  if (!token || storedUid !== uid) {
    return null;
  }

  return token;
}

async function getCachedSessionAccessToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    await clearSessionAccessToken();
    return null;
  }

  if (sessionTokenCache && sessionTokenCache.uid === user.uid) {
    // Check expiry before returning cached token
    if (isJwtExpired(sessionTokenCache.token)) {
      sessionTokenCache = null;
      await AsyncStorage.multiRemove([SESSION_TOKEN_STORAGE_KEY, SESSION_TOKEN_UID_STORAGE_KEY]);
      return null;
    }
    return sessionTokenCache.token;
  }

  if (sessionTokenCache && sessionTokenCache.uid !== user.uid) {
    sessionTokenCache = null;
  }

  const stored = await readStoredSessionAccessToken(user.uid);
  if (stored) {
    // Check expiry before using stored token
    if (isJwtExpired(stored)) {
      await AsyncStorage.multiRemove([SESSION_TOKEN_STORAGE_KEY, SESSION_TOKEN_UID_STORAGE_KEY]);
      return null;
    }
    sessionTokenCache = { uid: user.uid, token: stored };
    return stored;
  }

  return null;
}

async function bootstrapSessionAccessToken(
  forceRefreshFirebaseToken = false
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("apiFetch: No authenticated user. Please log in first.");
  }

  if (inflightSessionPromise) {
    return inflightSessionPromise;
  }

  inflightSessionPromise = (async () => {
    const firebaseIdToken = await user.getIdToken(forceRefreshFirebaseToken);

    const response = await fetchWithRetry(
      `${BASE_URL}/auth/login`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${firebaseIdToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      MAX_RETRIES,
      DEFAULT_TIMEOUT_MS
    );

    if (!response.ok) {
      let message = `Session bootstrap failed (${response.status})`;
      try {
        const json = (await response.json()) as {
          message?: string;
          error?: {
            message?: string;
          };
        };
        message = json.error?.message ?? json.message ?? message;
      } catch {
        // Keep fallback status message when response body is not JSON.
      }
      throw new Error(message);
    }

    const body = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      data?: {
        accessToken?: string;
      };
    };

    const accessToken = body.data?.accessToken ?? body.accessToken;
    if (!accessToken) {
      throw new Error("Session bootstrap succeeded but no accessToken was returned.");
    }

    await persistSessionAccessToken(user.uid, accessToken);
    return accessToken;
  })().finally(() => {
    inflightSessionPromise = null;
  });

  return inflightSessionPromise;
}

export async function ensureBackendSession(
  forceRefreshFirebaseToken = false
): Promise<string> {
  const cached = await getCachedSessionAccessToken();
  if (cached && !forceRefreshFirebaseToken) {
    return cached;
  }

  return bootstrapSessionAccessToken(forceRefreshFirebaseToken);
}

export async function getSessionAccessToken(): Promise<string> {
  return ensureBackendSession();
}

// ---------------------------------------------------------------------------
// School context header — reads the schoolId persisted during school-select
// ---------------------------------------------------------------------------

async function getSchoolIdHeader(): Promise<Record<string, string>> {
  try {
    const schoolId = await AsyncStorage.getItem("schoolId");
    if (schoolId && schoolId.trim().length > 0) {
      return { "X-School-Id": schoolId.trim() };
    }
  } catch {
    // AsyncStorage read failure is non-fatal — proceed without header
  }
  return {};
}

/**
 * apiFetch — authenticated fetch wrapper.
 *
 * Automatically:
 *  1. Ensures backend session JWT is available (bootstraps via /auth/login if needed).
 *  2. Attaches `Authorization: Bearer <sessionToken>` and `Content-Type: application/json`.
 *  3. Attaches `X-School-Id` header from the stored school context (for tenant isolation).
 *  4. Throws a descriptive Error if the response is not 2xx.
 *  5. Returns the parsed JSON body.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  // Build URL with optional query params
  let url = `${BASE_URL}${path}`;
  if (options.params) {
    const qs = Object.entries(options.params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    if (qs) url = `${url}?${qs}`;
  }

  const method: HttpMethod = options.method ?? "GET";

  // Resolve school context header (tenant isolation for SuperAdmin)
  const schoolHeader = await getSchoolIdHeader();

  let hasRetriedAfterSessionRefresh = false;

  while (true) {
    const sessionToken = await ensureBackendSession();

    const headers: HeadersInit = {
      "Authorization": `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
      ...schoolHeader,
    };

    const fetchInit: RequestInit = { method, headers };
    if (options.body !== undefined) {
      fetchInit.body = JSON.stringify(options.body);
    }

    const response = await fetchWithRetry(url, fetchInit);

    if (response.ok) {
      if (response.status === 204) {
        return undefined as unknown as T;
      }

      const body = await response.json();
      // Backend wraps responses in { success, data, meta } — unwrap .data
      return (body?.data ?? body) as T;
    }

    let errorMessage = `API error ${response.status}: ${response.statusText}`;
    let errorCode: string | null = null;

    try {
      const errorBody = (await response.json()) as {
        message?: string;
        error?: {
          message?: string;
          code?: string;
        };
      };
      errorMessage =
        errorBody.error?.message ??
        errorBody.message ??
        errorMessage;
      errorCode = errorBody.error?.code ?? null;
    } catch {
      // Keep status text fallback when error body is non-JSON.
    }

    const shouldRefreshSession =
      response.status === 401 &&
      !hasRetriedAfterSessionRefresh &&
      (errorCode === "AUTH_TOKEN_INVALID" || errorCode === "AUTH_TOKEN_MISSING");

    if (shouldRefreshSession) {
      hasRetriedAfterSessionRefresh = true;
      await clearSessionAccessToken();
      await ensureBackendSession(true);
      continue;
    }

    throw new Error(errorMessage);
  }
}

