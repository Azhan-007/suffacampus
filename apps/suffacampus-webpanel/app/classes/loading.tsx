import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function ClassesLoading() {
  return <SkeletonTablePage statCards={3} columns={5} rows={6} />;
}
