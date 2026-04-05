import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function TeachersLoading() {
  return <SkeletonTablePage statCards={4} columns={6} rows={8} />;
}
