import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function ReportsLoading() {
  return <SkeletonTablePage statCards={0} columns={4} rows={6} />;
}
