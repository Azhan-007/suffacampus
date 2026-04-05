import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function AttendanceLoading() {
  return <SkeletonTablePage statCards={4} columns={5} rows={8} />;
}
