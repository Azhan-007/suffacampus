import Skeleton from '@/components/common/Skeleton';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function NotificationsLoading() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
