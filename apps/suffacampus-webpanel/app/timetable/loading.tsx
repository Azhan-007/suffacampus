import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function TimetableLoading() {
  return <SkeletonTablePage statCards={0} columns={6} rows={8} />;
}
