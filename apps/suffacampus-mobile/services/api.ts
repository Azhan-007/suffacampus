/**
 * API Helper — wraps all HTTP requests to the Fastify backend.
 *
 * Architecture rules:
 *  - Firebase Auth stays client-side (uses ID token for every request).
 *  - Firestore client SDK is NOT used here or anywhere in the services layer.
 *  - All data reads/writes go through the backend URL below.
 *
 * ⚠️  On a physical device, `localhost` resolves to the phone itself.
 *     Use your PC's LAN IP instead (shown after `npm run dev` / `tsx watch`).
 */

import { auth } from "../firebase";
import Constants from "expo-constants";

// ─── Timeout + Retry Config ─────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000; // 15 seconds
const MAX_RETRIES = 1;
const RETRY_BASE_MS = 500;
const RETRYABLE_STATUSES = new Set([408, 502, 503, 504]);

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
 *  2. Fallback to localhost:5000/api/v1 (works on web / emulators)
 *
 * For a physical device, set EXPO_PUBLIC_API_URL to your PC's LAN IP:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.100:5000/api/v1
 *
 * The URL MUST include the /api/v1 prefix — all backend routes live there.
 */
export const BASE_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string) ??
  process.env.EXPO_PUBLIC_API_URL ??
  (() => {
    if (__DEV__) return "http://localhost:5000/api/v1";
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Configure it in .env for production builds."
    );
  })();

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiFetchOptions {
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
}

type TokenCache = {
  uid: string;
  token: string;
  fetchedAtMs: number;
};

let tokenCache: TokenCache | null = null;
let inflightTokenPromise: Promise<string> | null = null;
const TOKEN_REUSE_WINDOW_MS = 60_000;

async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("apiFetch: No authenticated user. Please log in first.");
  }

  const now = Date.now();
  if (tokenCache && tokenCache.uid !== user.uid) {
    tokenCache = null;
  }

  if (tokenCache && now - tokenCache.fetchedAtMs < TOKEN_REUSE_WINDOW_MS) {
    return tokenCache.token;
  }

  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = user
    .getIdToken()
    .then((token) => {
      tokenCache = { uid: user.uid, token, fetchedAtMs: Date.now() };
      return token;
    })
    .finally(() => {
      inflightTokenPromise = null;
    });

  return inflightTokenPromise;
}

/**
 * apiFetch — authenticated fetch wrapper.
 *
 * Automatically:
 *  1. Retrieves the current Firebase user.
 *  2. Obtains a fresh ID token via getIdToken().
 *  3. Attaches `Authorization: Bearer <token>` and `Content-Type: application/json`.
 *  4. Throws a descriptive Error if the response is not 2xx.
 *  5. Returns the parsed JSON body.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const token = await getAuthToken();

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

  const headers: HeadersInit = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const fetchInit: RequestInit = { method, headers };
  if (options.body !== undefined) {
    fetchInit.body = JSON.stringify(options.body);
  }

  const response = await fetchWithRetry(url, fetchInit);

  if (!response.ok) {
    let errorMessage = `API error ${response.status}: ${response.statusText}`;
    try {
      const errorBody = (await response.json()) as { message?: string };
      if (errorBody.message) errorMessage = `API error ${response.status}: ${errorBody.message}`;
    } catch {
      // If the error body is not JSON, use the status text message above.
    }
    throw new Error(errorMessage);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  // Backend wraps responses in { success, data, meta } — unwrap .data
  const body = await response.json();
  return (body?.data ?? body) as T;
}
