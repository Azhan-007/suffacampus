import { SkeletonTablePage } from '@/components/common/Skeleton';

export default function WebhooksLoading() {
  return <SkeletonTablePage statCards={4} columns={6} rows={8} />;
}
