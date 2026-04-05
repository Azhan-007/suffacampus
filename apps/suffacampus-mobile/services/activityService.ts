/**
 * activityService.ts
 *
 * Replaces Firestore onSnapshot and getDocs calls on the "activities" collection.
 * No real-time listener — use polling if live updates are needed.
 *
 * Backend routes:
 *   GET /activities?studentId=&limit=
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActivityItem {
  id: string;
  type:
    | "Assignment"
    | "Exam"
    | "Event"
    | "Announcement"
    | "Fee"
    | "Library"
    | "Attendance";
  title: string;
  description: string;
  date: string;
  time?: string;
  status?: "pending" | "completed" | "upcoming" | "overdue";
  priority?: "high" | "medium" | "low";
  createdAt?: string;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Fetch the activity feed.
 * Replaces: onSnapshot + getDocs on "activities" collection.
 */
export async function getActivities(params?: {
  studentId?: string;
  limit?: number;
}): Promise<ActivityItem[]> {
  try {
    return await apiFetch<ActivityItem[]>("/activities", { params });
  } catch {
    return [];
  }
}
