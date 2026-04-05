import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function ResultsLoading() {
  return <SkeletonTablePage statCards={3} columns={6} rows={8} />;
}
