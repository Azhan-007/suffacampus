'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';

export type NotificationTargetType = 'USER' | 'ROLE' | 'SCHOOL';

export interface NotificationItem {
  id: string;
  schoolId: string;
  title: string;
  message: string;
  type: string | null;
  severity: string | null;
  actionUrl: string | null;
  targetType: NotificationTargetType;
  targetId: string | null;
  referenceId: string | null;
  referenceType: string | null;
  createdBy: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  count: number;
}

export interface UseNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
  enabled?: boolean;
}

export interface UnreadCountResponse {
  unreadCount: number;
}

export interface NotificationPreferences {
  id: string;
  userId: string;
  schoolId: string;
  attendanceEnabled: boolean;
  feesEnabled: boolean;
  resultsEnabled: boolean;
  generalEnabled: boolean;
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateNotificationPreferencesInput {
  attendanceEnabled?: boolean;
  feesEnabled?: boolean;
  resultsEnabled?: boolean;
  generalEnabled?: boolean;
  inAppEnabled?: boolean;
  pushEnabled?: boolean;
  emailEnabled?: boolean;
}

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationQueryKeys.all, 'list'] as const,
  list: (options: Pick<UseNotificationsOptions, 'limit' | 'unreadOnly'> = {}) =>
    [
      ...notificationQueryKeys.lists(),
      options.limit ?? null,
      options.unreadOnly ?? false,
    ] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

function buildNotificationsPath(options: Pick<UseNotificationsOptions, 'limit' | 'unreadOnly'>): string {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.unreadOnly) params.set('unreadOnly', 'true');
  const query = params.toString();
  return `/notifications${query ? `?${query}` : ''}`;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { enabled = true, limit, unreadOnly } = options;

  const query = useQuery<NotificationsResponse, ApiError>({
    queryKey: notificationQueryKeys.list({ limit, unreadOnly }),
    queryFn: () =>
      apiFetch<NotificationsResponse>(
        buildNotificationsPath({ limit, unreadOnly })
      ),
    enabled,
  });

  return {
    ...query,
    notifications: query.data?.notifications ?? [],
    count: query.data?.count ?? 0,
  };
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();

  type MarkAsReadContext = {
    previousLists: Array<[readonly unknown[], NotificationsResponse | undefined]>;
    previousUnread?: UnreadCountResponse;
  };

  return useMutation<{ marked: boolean }, ApiError, string, MarkAsReadContext>({
    mutationFn: (notificationId: string) =>
      apiFetch<{ marked: boolean }>(`/notifications/${notificationId}/read`, {
        method: 'PATCH',
      }),
    onMutate: async (notificationId: string) => {
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.lists() });
      await queryClient.cancelQueries({ queryKey: notificationQueryKeys.unreadCount });

      const previousLists = queryClient.getQueriesData<NotificationsResponse>({
        queryKey: notificationQueryKeys.lists(),
      }) as Array<[readonly unknown[], NotificationsResponse | undefined]>;
      const previousUnread = queryClient.getQueryData<UnreadCountResponse>(
        notificationQueryKeys.unreadCount
      );

      let wasUnread = false;
      const now = new Date().toISOString();

      previousLists.forEach(([queryKey]) => {
        const keyParts = queryKey as unknown[];
        const unreadOnly = keyParts[2] === true;

        queryClient.setQueryData<NotificationsResponse>(queryKey, (old) => {
          if (!old) return old;

          const index = old.notifications.findIndex(
            (item) => item.id === notificationId
          );

          if (index === -1) return old;

          const current = old.notifications[index];
          if (!current.isRead) wasUnread = true;

          let nextNotifications = old.notifications.map((item) =>
            item.id === notificationId
              ? { ...item, isRead: true, readAt: item.readAt ?? now }
              : item
          );

          if (unreadOnly) {
            nextNotifications = nextNotifications.filter(
              (item) => item.id !== notificationId
            );
          }

          return {
            ...old,
            notifications: nextNotifications,
            count: unreadOnly ? nextNotifications.length : old.count,
          };
        });
      });

      if (previousUnread && wasUnread) {
        queryClient.setQueryData<UnreadCountResponse>(
          notificationQueryKeys.unreadCount,
          {
            unreadCount: Math.max(0, previousUnread.unreadCount - 1),
          }
        );
      }

      return { previousLists, previousUnread };
    },
    onError: (_error, _notificationId, context) => {
      if (!context) return;
      context.previousLists.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      if (context.previousUnread) {
        queryClient.setQueryData(
          notificationQueryKeys.unreadCount,
          context.previousUnread
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount });
    },
  });
}

export function useUnreadCount(enabled: boolean = true) {
  const query = useQuery<UnreadCountResponse, ApiError>({
    queryKey: notificationQueryKeys.unreadCount,
    queryFn: () => apiFetch<UnreadCountResponse>('/notifications/unread-count'),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  });

  return {
    ...query,
    unreadCount: query.data?.unreadCount ?? 0,
  };
}

export function usePreferences(enabled: boolean = true) {
  return useQuery<NotificationPreferences, ApiError>({
    queryKey: notificationQueryKeys.preferences,
    queryFn: () => apiFetch<NotificationPreferences>('/notifications/preferences'),
    enabled,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation<
    NotificationPreferences,
    ApiError,
    UpdateNotificationPreferencesInput
  >({
    mutationFn: (input: UpdateNotificationPreferencesInput) =>
      apiFetch<NotificationPreferences>('/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount });
    },
  });
}
