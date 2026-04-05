import { apiFetch } from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'payment'
  | 'subscription'
  | 'system';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class NotificationService {
  /** Fetch notifications for the current user */
  static async getNotifications(options?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<Notification[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.unreadOnly) params.set('unreadOnly', 'true');
    const qs = params.toString();
    return apiFetch<Notification[]>(`/notifications${qs ? `?${qs}` : ''}`);
  }

  /** Get the unread count */
  static async getUnreadCount(): Promise<number> {
    const data = await apiFetch<{ count: number }>('/notifications/unread-count');
    return data.count;
  }

  /** Mark a single notification as read */
  static async markAsRead(notificationId: string): Promise<void> {
    await apiFetch(`/notifications/${notificationId}/read`, { method: 'PATCH' });
  }

  /** Mark all notifications as read */
  static async markAllAsRead(): Promise<void> {
    await apiFetch('/notifications/read-all', { method: 'POST' });
  }

  /** Register an FCM device token for push notifications */
  static async registerPushToken(token: string): Promise<void> {
    await apiFetch('/notifications/push/register', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  /** Unregister an FCM device token */
  static async unregisterPushToken(token: string): Promise<void> {
    await apiFetch('/notifications/push/unregister', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
  }
}
