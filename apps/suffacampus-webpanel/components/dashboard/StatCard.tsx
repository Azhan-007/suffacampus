'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import AnimatedCounter from './AnimatedCounter';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color?: 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky';
  trend?: { value: number; isPositive: boolean };
  subtitle?: string;
  loading?: boolean;
  prefix?: string;
  suffix?: string;
  formatter?: (val: number) => string;
}

const COLOR_MAP = {
  blue:    { cardBg: 'bg-blue-50',    cardBorder: 'border-blue-200',    iconBg: 'bg-blue-100',    text: 'text-blue-600' },
  emerald: { cardBg: 'bg-emerald-50', cardBorder: 'border-emerald-200', iconBg: 'bg-emerald-100', text: 'text-emerald-600' },
  violet:  { cardBg: 'bg-violet-50',  cardBorder: 'border-violet-200',  iconBg: 'bg-violet-100',  text: 'text-violet-600' },
  amber:   { cardBg: 'bg-amber-50',   cardBorder: 'border-amber-200',   iconBg: 'bg-amber-100',   text: 'text-amber-600' },
  rose:    { cardBg: 'bg-rose-50',    cardBorder: 'border-rose-200',    iconBg: 'bg-rose-100',    text: 'text-rose-600' },
  sky:     { cardBg: 'bg-sky-50',     cardBorder: 'border-sky-200',     iconBg: 'bg-sky-100',     text: 'text-sky-600' },
};

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-7 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <div className="w-20 h-3 bg-slate-100 rounded" />
          <div className="w-16 h-8 bg-slate-100 rounded" />
          <div className="w-24 h-2.5 bg-slate-50 rounded" />
        </div>
        <div className="w-11 h-11 bg-slate-100 rounded-xl" />
      </div>
    </div>
  );
}

export default function StatCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  trend,
  subtitle,
  loading = false,
  prefix,
  suffix,
  formatter,
}: StatCardProps) {
  if (loading) return <StatCardSkeleton />;

  const c = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div
      className={`${c.cardBg} rounded-xl border ${c.cardBorder} p-7 transition-colors duration-150 cursor-default`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between">
        {/* Content */}
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-slate-500">{title}</p>
          <p className="text-[28px] font-semibold text-slate-900 leading-tight tracking-tight tabular-nums">
            <AnimatedCounter value={value} prefix={prefix} suffix={suffix} formatter={formatter} />
          </p>
          {trend && (
            <div className="flex items-center gap-1 pt-1">
              {trend.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              )}
              <span
                className={`text-xs font-medium ${
                  trend.isPositive ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-slate-400 ml-0.5">vs last month</span>
            </div>
          )}
          {subtitle && !trend && (
            <p className="text-xs text-slate-400 pt-1">{subtitle}</p>
          )}
        </div>

        {/* Icon */}
        <div className={`w-11 h-11 rounded-xl ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
      </div>
    </div>
  );
}
