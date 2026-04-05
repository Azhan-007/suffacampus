'use client';

import { formatDistanceToNow } from 'date-fns';
import type { NotificationItem as NotificationRecord } from '@/hooks/useNotifications';

interface NotificationItemProps {
  notification: NotificationRecord;
  onMarkAsRead: (notificationId: string) => void;
  isMarking?: boolean;
}

function getRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return formatDistanceToNow(date, { addSuffix: true });
}

export default function NotificationItem({
  notification,
  onMarkAsRead,
  isMarking = false,
}: NotificationItemProps) {
  const handleClick = () => {
    if (notification.isRead || isMarking) return;
    onMarkAsRead(notification.id);
  };

  const isUnread = !notification.isRead;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-colors ${
        isUnread
          ? 'bg-blue-50/40 border-blue-200/60 hover:bg-blue-50/60'
          : 'bg-white border-slate-200 hover:bg-slate-50'
      }`}
      disabled={isMarking}
      aria-label={`Notification: ${notification.title}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm font-medium truncate ${isUnread ? 'text-slate-900' : 'text-slate-700'}`}>
            {notification.title}
          </p>
          {isUnread && <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-1" />}
        </div>

        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{notification.message}</p>

        <p className="text-xs text-slate-400 mt-2">{getRelativeTime(notification.createdAt)}</p>
      </div>
    </button>
  );
}
