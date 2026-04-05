'use client';

import { UserPlus, CreditCard, BookOpen, CheckCircle2, Clock, GraduationCap, LucideIcon } from 'lucide-react';

export interface ActivityItem {
  type: 'enroll' | 'payment' | 'assignment' | 'attendance' | 'teacher' | 'other';
  text: string;
  time: string;
}

const ICON_MAP: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  enroll:     { icon: UserPlus,     bg: 'bg-blue-50',    fg: 'text-blue-500' },
  payment:    { icon: CreditCard,   bg: 'bg-emerald-50', fg: 'text-emerald-500' },
  assignment: { icon: BookOpen,     bg: 'bg-amber-50',   fg: 'text-amber-500' },
  attendance: { icon: CheckCircle2, bg: 'bg-sky-50',     fg: 'text-sky-500' },
  teacher:    { icon: GraduationCap,bg: 'bg-violet-50',  fg: 'text-violet-500' },
  other:      { icon: Clock,        bg: 'bg-slate-50',   fg: 'text-slate-400' },
};

function ActivitySkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5 animate-pulse">
          <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-slate-100 rounded w-3/4" />
            <div className="h-2.5 bg-slate-50 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
}

export default function ActivityFeed({ activities, loading = false }: ActivityFeedProps) {
  if (loading) return <ActivitySkeleton />;

  if (activities.length === 0) {
    return (
      <div className="text-center py-10">
        <Clock className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        <p className="text-sm text-slate-400">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {activities.map((a, i) => {
        const config = ICON_MAP[a.type] || ICON_MAP.other;
        const IconComp = config.icon;
        return (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group cursor-default"
          >
            <div className={`w-9 h-9 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
              <IconComp className={`w-4 h-4 ${config.fg}`} />
            </div>
            <p className="flex-1 text-sm text-slate-600 min-w-0 truncate leading-snug">{a.text}</p>
            <span className="text-xs text-slate-300 whitespace-nowrap font-medium tabular-nums">{a.time}</span>
          </div>
        );
      })}
    </div>
  );
}
