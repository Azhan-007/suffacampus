/**
 * notificationService.ts
 *
 * Backend routes:
 *   GET   /notifications?teacherId=&limit=  — list notifications
 *   PATCH /notifications/:id/read           — mark one as read
 *   PATCH /notifications/read-all           — mark all as read for a teacher
 */

import { apiFetch } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: "assignment" | "result" | "attendance" | "general";
  title: string;
  message: string;
  time: string;
  read: boolean;
  actionRoute?: string;
  actionParams?: Record<string, string>;
  teacherId?: string;
  studentId?: string;
}

type NotificationsApiResponse =
  | Notification[]
  | {
      notifications?: Notification[];
      count?: number;
    };

// ─── Functions ───────────────────────────────────────────────────────────────

/** Fetch notifications for the current user. Backend filters by auth token. */
export async function getNotifications(params: {
  teacherId?: string;
  studentId?: string;
  limit?: number;
}): Promise<Notification[]> {
  try {
    const response = await apiFetch<NotificationsApiResponse>("/notifications", {
      params: { limit: params.limit },
    });

    if (Array.isArray(response)) {
      return response;
    }

    return Array.isArray(response?.notifications) ? response.notifications : [];
  } catch {
    return [];
  }
}

/** Mark a single notification as read. */
export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch<void>(`/notifications/${id}/read`, { method: "PATCH" });
}

/** Mark all notifications as read. Backend uses POST, not PATCH. */
export async function markAllNotificationsRead(params: {
  teacherId?: string;
  studentId?: string;
}): Promise<void> {
  await apiFetch<void>("/notifications/read-all", {
    method: "POST",
    body: params,
  });
}
