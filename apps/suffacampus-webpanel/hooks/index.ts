//  Barrel export for hooks 

export { useApiQuery, useApiMutation } from './useApiQuery';
export type { UseApiQueryOptions, UseApiMutationOptions } from './useApiQuery';
export { useFcmForegroundListener } from './useFcmForegroundListener';
export {
  useNotifications,
  useMarkAsRead,
  useUnreadCount,
  usePreferences,
  useUpdatePreferences,
  notificationQueryKeys,
} from './useNotifications';
export type {
  NotificationItem,
  NotificationsResponse,
  NotificationPreferences,
  UpdateNotificationPreferencesInput,
  UseNotificationsOptions,
} from './useNotifications';
export { useCrudList } from './useCrudList';
export type { SortDir, UseCrudListOptions, UseCrudListReturn } from './useCrudList';
export { useCrudModal } from './useCrudModal';
export type { DeleteDialogState, UseCrudModalOptions, UseCrudModalReturn } from './useCrudModal';
export { useDocumentTitle } from './useDocumentTitle';
export { usePaginatedQuery } from './usePaginatedQuery';
export { useUsageLimits, useLimitGuard } from './useUsageLimits';
export {
  useSchoolContext,
  withSchoolContext,
  requireSchoolId,
} from './useSchoolContext';
