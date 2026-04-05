import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function StudentsLoading() {
  return <SkeletonTablePage statCards={4} columns={6} rows={8} />;
}
