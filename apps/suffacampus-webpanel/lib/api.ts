import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { PUBLIC_API_URL } from '@/lib/runtime-config';
import { clearSessionAccessToken, getSessionAccessToken } from '@/lib/session-token';

const BASE_URL = PUBLIC_API_URL;

// --- Retry configuration ------------------------------------------------------
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 500;     // exponential backoff: 500 -> 1000
const REQUEST_TIMEOUT_MS = 60_000;

/** Non-idempotent methods must NEVER be retried (risk of duplicates). */
const NON_RETRYABLE_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

/** Status codes that should trigger a retry. */
const RETRYABLE_STATUS = new Set([408, 502, 503, 504]);

type AuthMode = 'session' | 'firebase' | 'none' | 'auto';

export interface ApiFetchOptions extends RequestInit {
  authMode?: AuthMode;
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves once Firebase has restored auth state (currentUser is set or null).
 * Prevents 401s caused by polling before the session is hydrated.
 */
function waitForAuthReady(): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      unsubscribe();
      resolve();
    });
  });
}

const authReady = waitForAuthReady();

async function resolveAuthToken(authMode: AuthMode): Promise<string | null> {
  if (authMode === 'none') {
    return null;
  }

  if (authMode === 'session') {
    return getSessionAccessToken();
  }

  await authReady;

  if (authMode === 'firebase') {
    return (await auth.currentUser?.getIdToken()) ?? null;
  }

  const sessionToken = getSessionAccessToken();
  if (sessionToken) {
    return sessionToken;
  }

  return (await auth.currentUser?.getIdToken()) ?? null;
}

/**
 * Typed API error  -  carries the HTTP status and machine-readable code.
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  constructor(public readonly status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code ?? 'UNKNOWN_ERROR';
    this.details = details;
  }
}

/**
 * Thin fetch wrapper that:
 * 1. Attaches backend session JWT by default (or Firebase token when requested)
 * 2. Defaults Content-Type to application/json
 * 3. Retries transient failures (5xx, network errors) with exponential backoff
 * 4. Aborts after REQUEST_TIMEOUT_MS (default 30 s)
 * 5. Throws ApiError for non-2xx responses (with machine-readable error codes)
 * 6. Returns parsed JSON (or undefined for 204 No Content)
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { authMode = 'auto', ...fetchOptions } = options;
  const token = await resolveAuthToken(authMode);
  const { user, currentSchool } = useAuthStore.getState();
  const schoolHeader: Record<string, string> = {};
  if (user?.role === 'SuperAdmin' && currentSchool?.id) {
    schoolHeader['X-School-Id'] = currentSchool.id;
  }

  const headers: Record<string, string> = {
    // Only set Content-Type for requests with a body (Fastify 5 rejects
    // Content-Type: application/json when the body is empty)
    ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
    ...(fetchOptions.headers as Record<string, string> | undefined),
    ...schoolHeader,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let lastError: Error | undefined;
  const method = (fetchOptions.method ?? 'GET').toUpperCase();
  const maxRetries = NON_RETRYABLE_METHODS.has(method) ? 0 : MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Back off before retries (skip on first attempt)
    if (attempt > 0) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...fetchOptions,
        headers,
        signal: fetchOptions.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Support new standardized envelope: { success, error: { code, message } }
        const envelope = body as Record<string, unknown>;
        const errorObj = envelope?.error as Record<string, string> | undefined;
        const message =
          errorObj?.message ??
          (envelope?.message as string) ??
          `Request failed with status ${res.status}`;
        const code = errorObj?.code ?? 'UNKNOWN_ERROR';
        const details = errorObj?.details;

        if (
          res.status === 401 &&
          (code === 'AUTH_TOKEN_INVALID' || code === 'AUTH_TOKEN_MISSING')
        ) {
          clearSessionAccessToken();
        }

        // Surface rate-limit errors to the user immediately
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retryMsg = retryAfter
            ? `Too many requests. Please wait ${retryAfter}s and try again.`
            : 'Too many requests. Please slow down and try again in a moment.';
          toast.error(retryMsg, { id: 'rate-limit', duration: 5000 });
        }

        const apiError = new ApiError(res.status, message, code, details);

        // Retry on transient server errors (not 4xx client errors)
        if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          lastError = apiError;
          continue;
        }

        throw apiError;
      }

      if (res.status === 204) return undefined as T;

      const json = await res.json();



      // Auto-unwrap the standard backend envelope { success, data }
      if (
        json &&
        typeof json === 'object' &&
        'success' in json &&
        'data' in json
      ) {
        return (json as Record<string, unknown>).data as T;
      }

      return json as T;
    } catch (err) {
      clearTimeout(timeoutId);

      // AbortError = timeout  -  retryable
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new ApiError(0, 'Request timed out', 'TIMEOUT');
        if (attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      // Network error (TypeError: Failed to fetch)  -  retryable
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        lastError = err;
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new ApiError(0, 'Request failed after retries', 'RETRY_EXHAUSTED');
}

/* ------------------------------------------------------------------ */
/*  Paginated variant  -  returns { data, pagination } without unwrap   */
/* ------------------------------------------------------------------ */

export interface PaginationMeta {
  cursor: string | null;
  hasMore: boolean;
  total?: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string | null;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  count?: boolean;
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Build a query string from pagination + filter params.
 * Skips null/undefined values.
 */
function toQueryString(params: PaginationParams): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams();
  entries.forEach(([k, v]) => qs.set(k, String(v)));
  return `?${qs.toString()}`;
}

/**
 * Fetch a paginated endpoint with retry + timeout.
 * Does NOT auto-unwrap  -  returns the full { data[], pagination } envelope
 * so callers retain cursor/hasMore metadata.
 */
export async function apiFetchPaginated<T>(
  path: string,
  params: PaginationParams = {},
  options: ApiFetchOptions = {}
): Promise<PaginatedResponse<T>> {
  const { authMode = 'auto', ...fetchOptions } = options;
  const token = await resolveAuthToken(authMode);
  const { user, currentSchool } = useAuthStore.getState();
  const schoolHeader: Record<string, string> = {};
  if (user?.role === 'SuperAdmin' && currentSchool?.id) {
    schoolHeader['X-School-Id'] = currentSchool.id;
  }

  const headers: Record<string, string> = {
    // Only set Content-Type for requests with a body
    ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
    ...(fetchOptions.headers as Record<string, string> | undefined),
    ...schoolHeader,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const url = `${BASE_URL}${path}${toQueryString(params)}`;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: fetchOptions.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const envelope = body as Record<string, unknown>;
        const errorObj = envelope?.error as Record<string, string> | undefined;
        const message =
          errorObj?.message ??
          (envelope?.message as string) ??
          `Request failed with status ${res.status}`;
        const code = errorObj?.code ?? 'UNKNOWN_ERROR';

        if (
          res.status === 401 &&
          (code === 'AUTH_TOKEN_INVALID' || code === 'AUTH_TOKEN_MISSING')
        ) {
          clearSessionAccessToken();
        }

        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          const retryMsg = retryAfter
            ? `Too many requests. Please wait ${retryAfter}s and try again.`
            : 'Too many requests. Please slow down and try again in a moment.';
          toast.error(retryMsg, { id: 'rate-limit', duration: 5000 });
        }

        const apiError = new ApiError(res.status, message, code);

        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          lastError = apiError;
          continue;
        }

        throw apiError;
      }

      const json = await res.json();

      return {
        data: json.data ?? [],
        pagination: json.pagination ?? { cursor: null, hasMore: false, limit: params.limit ?? 20 },
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new ApiError(0, 'Request timed out', 'TIMEOUT');
        if (attempt < MAX_RETRIES) continue;
        throw lastError;
      }

      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        lastError = err;
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new ApiError(0, 'Request failed after retries', 'RETRY_EXHAUSTED');
}
