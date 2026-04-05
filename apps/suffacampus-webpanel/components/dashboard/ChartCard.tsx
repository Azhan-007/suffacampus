'use client';

import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  icon: LucideIcon;
  color: 'blue' | 'emerald' | 'amber' | 'violet' | 'sky' | 'rose';
  badge?: ReactNode;
  headerRight?: ReactNode;
  loading?: boolean;
  children: ReactNode;
  height?: number;
}

const COLOR_MAP = {
  blue:    { headerBg: 'bg-blue-50',    iconColor: 'text-blue-500',    cardBorder: 'border-blue-200' },
  emerald: { headerBg: 'bg-emerald-50', iconColor: 'text-emerald-500', cardBorder: 'border-emerald-200' },
  amber:   { headerBg: 'bg-amber-50',   iconColor: 'text-amber-500',   cardBorder: 'border-amber-200' },
  violet:  { headerBg: 'bg-violet-50',  iconColor: 'text-violet-500',  cardBorder: 'border-violet-200' },
  sky:     { headerBg: 'bg-sky-50',     iconColor: 'text-sky-500',     cardBorder: 'border-sky-200' },
  rose:    { headerBg: 'bg-rose-50',    iconColor: 'text-rose-500',    cardBorder: 'border-rose-200' },
};

function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="p-5">
      <div
        className="bg-slate-50 rounded-xl animate-pulse flex items-end gap-2 px-6 pb-4"
        style={{ height }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-100 rounded-t-md"
            style={{ height: `${30 + Math.random() * 50}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChartCard({
  title,
  icon: Icon,
  color = 'blue',
  badge,
  headerRight,
  loading = false,
  children,
  height = 240,
}: ChartCardProps) {
  const c = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div
      className={`bg-white rounded-xl border ${c.cardBorder} overflow-hidden`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b ${c.cardBorder} ${c.headerBg}`}>
        <div className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-800">
          <Icon className={`w-4 h-4 ${c.iconColor}`} />
          {title}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {headerRight}
        </div>
      </div>

      {/* Body */}
      {loading ? <ChartSkeleton height={height} /> : (
        <div className="p-6">
          {children}
        </div>
      )}
    </div>
  );
}
