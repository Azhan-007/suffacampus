/**
 * authService.ts
 *
 * Backend routes (unauthenticated — called before login):
 *   GET  /api/v1/auth/user-by-username?username=  — resolve username → email + role
 *   GET  /api/v1/auth/schools?code=                — verify school code
 *
 * Note: These endpoints are public (no Bearer token required) because they
 * are called before the user is authenticated. The backend must allow these
 * paths without a token.
 */

import { BASE_URL, fetchWithTimeout } from "./api";
import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserLookupResult {
  email: string;
  role: "student" | "teacher" | "admin";
  name: string;
  studentId?: string | null;
  teacherId?: string | null;
}

export interface SchoolInfo {
  id: string;
  name: string;
  code: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  helpUrl?: string;
  address?: string;
  logoUrl?: string;
  primaryColor?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function publicFetch<T>(path: string): Promise<T> {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string; message?: string };
      if (json.error) message = json.error;
      else if (json.message) message = json.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as unknown as T;

  // Backend wraps responses in { success, data, meta } — unwrap .data
  const body = await response.json();
  return (body?.data ?? body) as T;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Resolve a username to an email address, role, and display name.
 * Called during login before `signInWithEmailAndPassword`.
 */
export async function getUserByUsername(
  username: string
): Promise<UserLookupResult> {
  const encoded = encodeURIComponent(username.trim().toLowerCase());
  return publicFetch<UserLookupResult>(
    `/auth/user-by-username?username=${encoded}`
  );
}

/**
 * Change password for the current user (after forced password change).
 */
export async function changePassword(
  idToken: string,
  newPassword: string
): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ newPassword }),
  });

  if (!response.ok) {
    let message = `Password change failed (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string; message?: string };
      if (json.error || json.message) message = (json.error ?? json.message)!;
    } catch { /* ignore */ }
    throw new Error(message);
  }
}

/**
 * Verify a school code and return the school's details.
 * Called on the school-select screen.
 */
export async function verifySchoolCode(code: string): Promise<SchoolInfo> {
  const encoded = encodeURIComponent(code.toUpperCase().trim());
  return publicFetch<SchoolInfo>(`/auth/schools?code=${encoded}`);
}

export interface ClassAssignment {
  classId: string;
  sectionId: string;
  className?: string;
  sectionName?: string;
}

export interface MyProfile {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  schoolId: string | null;
  teacherId: string | null;
  studentId: string | null;
  assignedClasses?: ClassAssignment[];
}

/** Fetch the authenticated user's profile (requires valid Firebase ID token). */
export async function getMyProfile(): Promise<MyProfile> {
  return apiFetch<MyProfile>("/auth/me");
}
