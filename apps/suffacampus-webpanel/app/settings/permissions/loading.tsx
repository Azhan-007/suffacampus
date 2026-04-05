import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function PermissionsLoading() {
  return <SkeletonTablePage statCards={0} columns={7} rows={12} />;
}
