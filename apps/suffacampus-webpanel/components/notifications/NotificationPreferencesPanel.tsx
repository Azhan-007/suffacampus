'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Toggle } from '@/components/common/FormElements';
import {
  notificationQueryKeys,
  usePreferences,
  useUpdatePreferences,
  type NotificationPreferences,
  type UpdateNotificationPreferencesInput,
} from '@/hooks';

type PreferenceToggleKey =
  | 'attendanceEnabled'
  | 'feesEnabled'
  | 'resultsEnabled'
  | 'generalEnabled'
  | 'inAppEnabled'
  | 'pushEnabled'
  | 'emailEnabled';

type ToggleConfig = {
  key: PreferenceToggleKey;
  label: string;
  description: string;
};

const CATEGORY_TOGGLES: ToggleConfig[] = [
  {
    key: 'attendanceEnabled',
    label: 'Attendance',
    description: 'Receive attendance-related notifications.',
  },
  {
    key: 'feesEnabled',
    label: 'Fees',
    description: 'Receive fee and payment notifications.',
  },
  {
    key: 'resultsEnabled',
    label: 'Results',
    description: 'Receive exam result notifications.',
  },
  {
    key: 'generalEnabled',
    label: 'General',
    description: 'Receive general school updates.',
  },
];

const CHANNEL_TOGGLES: ToggleConfig[] = [
  {
    key: 'inAppEnabled',
    label: 'In-app',
    description: 'Show notifications inside the app.',
  },
  {
    key: 'pushEnabled',
    label: 'Push',
    description: 'Allow push notifications on this device.',
  },
  {
    key: 'emailEnabled',
    label: 'Email',
    description: 'Receive notifications by email.',
  },
];

function PreferencesSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="h-16 rounded-lg bg-slate-100 animate-pulse"
        />
      ))}
    </div>
  );
}

interface PreferenceSectionProps {
  title: string;
  items: ToggleConfig[];
  preferences: NotificationPreferences;
  disabled: boolean;
  onToggle: (key: PreferenceToggleKey) => void;
}

function PreferenceSection({
  title,
  items,
  preferences,
  disabled,
  onToggle,
}: PreferenceSectionProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {title}
      </h4>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.key}
            className="p-3 rounded-lg border border-slate-100 bg-slate-50"
          >
            <Toggle
              checked={preferences[item.key]}
              onChange={() => onToggle(item.key)}
              label={item.label}
              description={item.description}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NotificationPreferencesPanel() {
  const queryClient = useQueryClient();
  const {
    data: preferences,
    isLoading,
    isError,
    error,
    refetch,
  } = usePreferences();
  const updatePreferences = useUpdatePreferences();

  const handleToggle = (key: PreferenceToggleKey) => {
    if (!preferences || updatePreferences.isPending) return;

    const previousPreferences = preferences;
    const nextValue = !preferences[key];

    const nextPreferences = {
      ...preferences,
      [key]: nextValue,
      updatedAt: new Date().toISOString(),
    } as NotificationPreferences;

    queryClient.setQueryData<NotificationPreferences>(
      notificationQueryKeys.preferences,
      nextPreferences
    );

    const payload = {
      [key]: nextValue,
    } as UpdateNotificationPreferencesInput;

    updatePreferences.mutate(payload, {
      onError: () => {
        queryClient.setQueryData<NotificationPreferences>(
          notificationQueryKeys.preferences,
          previousPreferences
        );
      },
    });
  };

  if (isLoading) {
    return <PreferencesSkeleton />;
  }

  if (isError) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-medium text-slate-800">
          Failed to load notification preferences
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {error?.message || 'Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!preferences) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Notification Preferences</h3>
        <p className="text-xs text-slate-500 mt-1">
          Choose which notifications you want to receive.
        </p>
      </div>

      <div className="p-5 space-y-6">
        <PreferenceSection
          title="Categories"
          items={CATEGORY_TOGGLES}
          preferences={preferences}
          disabled={updatePreferences.isPending}
          onToggle={handleToggle}
        />

        <PreferenceSection
          title="Channels"
          items={CHANNEL_TOGGLES}
          preferences={preferences}
          disabled={updatePreferences.isPending}
          onToggle={handleToggle}
        />

        {updatePreferences.isPending && (
          <p className="text-xs text-slate-400">Saving changes...</p>
        )}

        {updatePreferences.isError && (
          <p className="text-xs text-red-500">
            Failed to save changes. Reverted to previous values.
          </p>
        )}
      </div>
    </div>
  );
}
