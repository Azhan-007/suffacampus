import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function EventsLoading() {
  return <SkeletonTablePage statCards={3} columns={4} rows={6} />;
}
