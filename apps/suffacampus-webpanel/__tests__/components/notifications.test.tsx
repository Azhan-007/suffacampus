import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationList from '@/components/notifications/NotificationList';
import NotificationPreferencesPanel from '@/components/notifications/NotificationPreferencesPanel';
import UnreadNotificationBadge from '@/components/notifications/UnreadNotificationBadge';

const mockApiFetch = jest.fn();

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

type TestNotification = {
  id: string;
  schoolId: string;
  title: string;
  message: string;
  type: null;
  severity: null;
  actionUrl: null;
  targetType: string;
  targetId: string;
  referenceId: null;
  referenceType: null;
  createdBy: string;
  createdAt: string;
  isRead: boolean;
  readAt: string | null;
};

function buildNotification(overrides: Partial<TestNotification> = {}): TestNotification {
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

describe('Notification UI', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('renders notification list items', async () => {
    mockApiFetch.mockResolvedValueOnce({
      notifications: [buildNotification()],
      count: 1,
    });

    renderWithClient(<NotificationList limit={10} />);

    expect(await screen.findByText('Fee due')).toBeInTheDocument();
    expect(screen.getByText('Payment pending')).toBeInTheDocument();
  });

  it('marks a notification as read', async () => {
    let notifications = [buildNotification({ id: 'notif_1' })];

    mockApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path.startsWith('/notifications/') && options?.method === 'PATCH') {
        notifications = notifications.map((item) => ({
          ...item,
          isRead: true,
          readAt: '2024-01-01T11:00:00.000Z',
        }));
        return Promise.resolve({ marked: true });
      }

      if (path.startsWith('/notifications')) {
        return Promise.resolve({
          notifications,
          count: notifications.length,
        });
      }

      return Promise.resolve({});
    });

    renderWithClient(<NotificationList limit={10} />);

    const button = await screen.findByRole('button', {
      name: 'Notification: Fee due',
    });

    expect(button).toHaveClass('bg-blue-50/40');

    const user = userEvent.setup();
    await user.click(button);

    expect(mockApiFetch).toHaveBeenCalledWith('/notifications/notif_1/read', {
      method: 'PATCH',
    });

    await waitFor(() => {
      expect(button).toHaveClass('bg-white');
    });
  });

  it('rolls back optimistic mark-as-read on API failure', async () => {
    let notifications = [buildNotification({ id: 'notif_rollback' })];
    let rejectPatch: ((reason?: unknown) => void) | null = null;

    mockApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path.startsWith('/notifications/') && options?.method === 'PATCH') {
        return new Promise((_, reject) => {
          rejectPatch = reject;
        });
      }

      if (path.startsWith('/notifications')) {
        return Promise.resolve({
          notifications,
          count: notifications.length,
        });
      }

      return Promise.resolve({});
    });

    renderWithClient(<NotificationList limit={10} />);

    const button = await screen.findByRole('button', {
      name: 'Notification: Fee due',
    });

    expect(button).toHaveClass('bg-blue-50/40');

    const user = userEvent.setup();
    await user.click(button);

    await waitFor(() => {
      expect(button).toHaveClass('bg-white');
    });

    await act(async () => {
      rejectPatch?.(new Error('Failed to update'));
    });

    await waitFor(() => {
      expect(button).toHaveClass('bg-blue-50/40');
    });
  });

  it('updates unread badge and caps at 99+', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ unreadCount: 5 })
      .mockResolvedValueOnce({ unreadCount: 120 });

    const { queryClient } = renderWithClient(<UnreadNotificationBadge />);

    expect(await screen.findByText('5')).toBeInTheDocument();

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['notifications', 'unread-count'],
      });
    });

    expect(await screen.findByText('99+')).toBeInTheDocument();
  });

  it('toggles notification preferences', async () => {
    let currentPreferences = {
      id: 'pref_1',
      userId: 'user_1',
      schoolId: 'school_1',
      attendanceEnabled: true,
      feesEnabled: true,
      resultsEnabled: true,
      generalEnabled: true,
      inAppEnabled: true,
      pushEnabled: true,
      emailEnabled: false,
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z',
    };

    mockApiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/notifications/preferences' && options?.method === 'PATCH') {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
        currentPreferences = {
          ...currentPreferences,
          ...body,
          updatedAt: '2024-01-01T11:00:00.000Z',
        };
        return Promise.resolve(currentPreferences);
      }

      if (path === '/notifications/preferences') {
        return Promise.resolve(currentPreferences);
      }

      return Promise.resolve({});
    });

    renderWithClient(<NotificationPreferencesPanel />);

    const attendanceLabel = await screen.findByText('Attendance');
    const toggleRow = attendanceLabel.closest('div')?.parentElement;
    if (!toggleRow) {
      throw new Error('Attendance toggle not found');
    }

    const toggleButton = within(toggleRow).getByRole('button');
    expect(toggleButton).toHaveClass('bg-blue-600');

    const user = userEvent.setup();
    await user.click(toggleButton);

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/notifications/preferences',
      expect.objectContaining({ method: 'PATCH' })
    );

    await waitFor(() => {
      expect(toggleButton).toHaveClass('bg-slate-300');
    });
  });
});
