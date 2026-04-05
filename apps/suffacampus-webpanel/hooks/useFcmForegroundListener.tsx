'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { usePathname, useRouter } from 'next/navigation';
import firebaseApp from '@/lib/firebase';
import { notificationQueryKeys } from '@/hooks/useNotifications';
import type { MessagePayload } from 'firebase/messaging';
import type { UnreadCountResponse } from '@/hooks/useNotifications';

interface UseFcmForegroundListenerOptions {
  showToast?: boolean;
}

export function useFcmForegroundListener(
  options: UseFcmForegroundListenerOptions = {}
) {
  const { showToast = true } = options;
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let disposed = false;

    const showIncomingNotificationToast = (
      title: string,
      message: string,
      notificationId?: string
    ) => {
      toast.custom(
        (t) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              if (pathname !== '/notifications') {
                router.push('/notifications');
              }
            }}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-md p-3 text-left hover:bg-slate-50 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            {message ? (
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{message}</p>
            ) : null}
          </button>
        ),
        {
          id: notificationId,
          duration: 5000,
          position: 'top-right',
        }
      );
    };

    const handleMessage = (payload: MessagePayload) => {
      const notificationId = payload.data?.notificationId;

      if (showToast) {
        const title = payload.notification?.title || 'New notification';
        const message = payload.notification?.body || '';
        showIncomingNotificationToast(title, message, notificationId);
      }

      // Hybrid approach: immediate unread feedback + authoritative refetch.
      queryClient.setQueryData<UnreadCountResponse>(
        notificationQueryKeys.unreadCount,
        (old) => (old ? { unreadCount: old.unreadCount + 1 } : old)
      );

      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: notificationQueryKeys.unreadCount });
    };

    const setup = async () => {
      if (typeof window === 'undefined') return;

      const messagingModule = await import('firebase/messaging');
      if (disposed) return;

      const supported = await messagingModule.isSupported().catch(() => false);
      if (!supported || disposed) return;

      const messaging = messagingModule.getMessaging(firebaseApp);
      unsub = messagingModule.onMessage(messaging, handleMessage);
    };

    void setup();

    return () => {
      disposed = true;
      if (unsub) unsub();
    };
  }, [pathname, queryClient, router, showToast]);
}
