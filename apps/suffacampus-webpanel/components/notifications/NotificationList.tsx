'use client';

import EmptyState from '@/components/common/EmptyState';
import {
  useNotifications,
  useMarkAsRead,
  type UseNotificationsOptions,
} from '@/hooks';
import NotificationItem from './NotificationItem';

interface NotificationListProps {
  unreadOnly?: boolean;
  limit?: number;
  className?: string;
}

function NotificationListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-24 rounded-xl border border-slate-200 bg-slate-100/80 animate-pulse"
        />
      ))}
    </div>
  );
}

export default function NotificationList({
  unreadOnly = false,
  limit = 50,
  className = '',
}: NotificationListProps) {
  const queryOptions: UseNotificationsOptions = {
    unreadOnly,
    limit,
  };

  const {
    notifications,
    isLoading,
    isError,
    error,
    refetch,
  } = useNotifications(queryOptions);

  const markAsReadMutation = useMarkAsRead();

  const handleMarkAsRead = (notificationId: string) => {
    markAsReadMutation.mutate(notificationId);
  };

  if (isLoading) {
    return <NotificationListSkeleton />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Failed to load notifications"
        description={error?.message || 'Please try again.'}
        action={{
          label: 'Retry',
          onClick: () => {
            refetch();
          },
        }}
      />
    );
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        title="No notifications"
        description={
          unreadOnly
            ? 'You have no unread notifications.'
            : 'You are all caught up for now.'
        }
      />
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onMarkAsRead={handleMarkAsRead}
          isMarking={
            markAsReadMutation.isPending &&
            markAsReadMutation.variables === notification.id
          }
        />
      ))}
    </div>
  );
}
