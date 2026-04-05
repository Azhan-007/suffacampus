import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function FeesLoading() {
  return <SkeletonTablePage statCards={4} columns={5} rows={8} />;
}
