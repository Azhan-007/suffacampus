'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'title' | 'avatar' | 'card' | 'button' | 'custom';
  width?: string;
  height?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

export default function Skeleton({
  className = '',
  variant = 'custom',
  width,
  height,
  rounded = 'lg',
}: SkeletonProps) {
  const variants = {
    text: 'h-4 w-full',
    title: 'h-6 w-3/4',
    avatar: 'h-10 w-10 rounded-full',
    card: 'h-32 w-full',
    button: 'h-10 w-24',
    custom: '',
  };

  const roundedClasses = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    full: 'rounded-full',
  };

  const style = {
    ...(width && { width }),
    ...(height && { height }),
  };

  return (
    <div
      className={`skeleton ${variants[variant]} ${roundedClasses[rounded]} ${className}`}
      style={style}
    />
  );
}

// Skeleton presets for common use cases
export function SkeletonCard() {
  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="max-w-[100px]" />
          <Skeleton variant="title" className="max-w-[150px]" />
        </div>
        <Skeleton className="w-12 h-12" rounded="xl" />
      </div>
    </div>
  );
}

export function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-gray-100 animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <Skeleton variant="text" className="max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonForm() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton variant="text" className="max-w-[80px] h-3" />
            <Skeleton className="w-full h-10" rounded="xl" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        <Skeleton variant="button" />
        <Skeleton variant="button" className="w-32" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <Skeleton variant="title" className="mb-4" />
          <Skeleton className="w-full h-64" rounded="xl" />
        </div>
        <div className="card p-6">
          <Skeleton variant="title" className="mb-4" />
          <Skeleton className="w-full h-64" rounded="xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for pages with stat cards + table layout
 * (students, teachers, fees, classes, events, etc.)
 */
export function SkeletonTablePage({
  statCards = 4,
  columns = 5,
  rows = 6,
}: {
  statCards?: number;
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton variant="title" className="max-w-[200px]" />
          <Skeleton variant="text" className="max-w-[300px] h-3" />
        </div>
        <Skeleton variant="button" className="w-36" />
      </div>

      {/* Stat cards */}
      {statCards > 0 && (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(statCards, 4)} gap-6`}>
          {Array.from({ length: statCards }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Search / filter bar */}
      <div className="flex items-center gap-3">
        <Skeleton className="flex-1 max-w-sm h-10" rounded="xl" />
        <Skeleton className="w-32 h-10" rounded="xl" />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-5 py-3 text-left">
                  <Skeleton variant="text" className="max-w-[80px] h-3" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} columns={columns} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
