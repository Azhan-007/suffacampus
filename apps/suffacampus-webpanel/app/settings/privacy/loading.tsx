import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function PrivacyLoading() {
  return <SkeletonTablePage statCards={0} columns={6} rows={5} />;
}
