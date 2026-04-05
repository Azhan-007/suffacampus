'use client';

import { useUnreadCount } from '@/hooks';

interface UnreadNotificationBadgeProps {
  className?: string;
  showWhenZero?: boolean;
  enabled?: boolean;
}

function formatUnreadCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

export default function UnreadNotificationBadge({
  className = '',
  showWhenZero = false,
  enabled = true,
}: UnreadNotificationBadgeProps) {
  const { unreadCount, isError } = useUnreadCount(enabled);

  if (isError) return null;
  if (!showWhenZero && unreadCount <= 0) return null;

  return (
    <span
      className={`inline-flex min-w-[18px] h-[18px] items-center justify-center px-1 rounded-full bg-blue-600 text-white text-[10px] font-semibold leading-none ${className}`}
      aria-label={`${unreadCount} unread notifications`}
      title={`${unreadCount} unread notifications`}
    >
      {formatUnreadCount(unreadCount)}
    </span>
  );
}
