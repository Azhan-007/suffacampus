import '@testing-library/jest-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { NotificationService } from '@/services/notificationService';
import NotificationList from '@/components/notifications/NotificationList';
import UnreadNotificationBadge from '@/components/notifications/UnreadNotificationBadge';
import { useFcmForegroundListener } from '@/hooks';

const mockApiFetch = jest.fn();
const mockGetFcmToken = jest.fn();

jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock('@/lib/firebase', () => ({
  __esModule: true,
  default: {},
  getFcmToken: (...args: unknown[]) => mockGetFcmToken(...args),
}));

jest.mock('react-hot-toast', () => {
  const mockToast = {
    custom: jest.fn(),
    dismiss: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockToast,
    custom: mockToast.custom,
    dismiss: mockToast.dismiss,
  };
});

jest.mock('firebase/messaging', () => {
  const handlers: Array<(payload: unknown) => void> = [];
  return {
    __esModule: true,
    __handlers: handlers,
    isSupported: jest.fn().mockResolvedValue(true),
    getMessaging: jest.fn().mockReturnValue({}),
    onMessage: jest.fn((_messaging: unknown, handler: (payload: unknown) => void) => {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    }),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

function renderWithClient(ui: React.ReactElement) {
  const { queryClient, Wrapper } = createWrapper();
  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}

function buildNotification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'notif_1',
    schoolId: 'school_1',
    title: 'Fee due',
    message: 'Payment pending',
    type: null,
    severity: null,
    actionUrl: null,
    targetType: 'USER',
    targetId: 'user_1',
    referenceId: null,
    referenceType: null,
    createdBy: 'user_1',
    createdAt: '2024-01-01T10:00:00.000Z',
    isRead: false,
    readAt: null,
    ...overrides,
  };
}

function TokenRegistrationHarness() {
  useEffect(() => {
    const register = async () => {
      const { getFcmToken } = await import('@/lib/firebase');
      const token = await getFcmToken();
      if (token) {
        await NotificationService.registerPushToken(token);
      }
    };

    void register();
  }, []);

  return null;
}

function RealtimeHarness() {
  useFcmForegroundListener({ showToast: false });
  return (
    <>
      <UnreadNotificationBadge />
      <NotificationList limit={10} />
    </>
  );
}

describe('Notification realtime flow', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockGetFcmToken.mockReset();
  });

  it('registers device token with backend', async () => {
    mockGetFcmToken.mockResolvedValue('fcm-token-123');
    mockApiFetch.mockResolvedValue({ ok: true });

    renderWithClient(<TokenRegistrationHarness />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/notifications/push/register', {
        method: 'POST',
        body: JSON.stringify({ token: 'fcm-token-123' }),
      });
    });
  });

  it('updates UI and unread badge on foreground push', async () => {
    let notifications = [buildNotification({ id: 'notif_1' })];
    let unreadCount = 1;

    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/notifications/unread-count') {
        return Promise.resolve({ unreadCount });
      }

      if (path.startsWith('/notifications')) {
        return Promise.resolve({
          notifications,
          count: notifications.length,
        });
      }

      return Promise.resolve({});
    });

    renderWithClient(<RealtimeHarness />);

    expect(await screen.findByText('Fee due')).toBeInTheDocument();
    expect(await screen.findByText('1')).toBeInTheDocument();

    notifications = [
      buildNotification({ id: 'notif_2', title: 'New notice', message: 'Hello' }),
      ...notifications,
    ];
    unreadCount = 2;

    const messagingModule = await import('firebase/messaging') as any;
    await waitFor(() => expect(messagingModule.__handlers.length).toBeGreaterThan(0));

    await act(async () => {
      messagingModule.__handlers[0]({
        data: { notificationId: 'notif_2' },
        notification: { title: 'New notice', body: 'Hello' },
      });
    });

    expect(await screen.findByText('New notice')).toBeInTheDocument();
    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
