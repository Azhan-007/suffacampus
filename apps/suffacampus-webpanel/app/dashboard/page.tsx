'use client';

import { useState, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import DashboardLayout from '@/components/layout/DashboardLayout';
import StatCard from '@/components/dashboard/StatCard';
import ChartCard from '@/components/dashboard/ChartCard';
import ActivityFeed, { ActivityItem } from '@/components/dashboard/ActivityFeed';
import EventsList from '@/components/dashboard/EventsList';
import AnimatedCounter from '@/components/dashboard/AnimatedCounter';
import { Event, Student, Teacher, Fee, Attendance, Class } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { formatCurrency, formatCurrencyCompact } from '@/lib/designTokens';
import { useApiQuery } from '@/hooks/useApiQuery';
import {
  Users,
  GraduationCap,
  School,
  ClipboardCheck,
  IndianRupee,
  CalendarDays,
  TrendingUp,
  Clock,
  MoreHorizontal,
} from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay } from 'date-fns';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/* ------------------------------------------------------------------ */
/*  Custom tooltip                                                     */
/* ------------------------------------------------------------------ */

interface ChartTooltipEntry {
  name: string;
  value: number;
  color?: string;
  fill?: string;
  dataKey: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: string;
}

const ChartTooltip = ({ active, payload, label }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p: ChartTooltipEntry, i: number) => (
        <p key={i} className="text-slate-500">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold text-slate-700">
            {p.dataKey === 'rate' ? `${p.value}%` : p.dataKey === 'collected' || p.dataKey === 'pending' ? `₹${p.value}K` : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Range toggle button                                                */
/* ------------------------------------------------------------------ */

function RangeToggle({
  range,
  onChange,
}: {
  range: '7d' | '30d';
  onChange: (r: '7d' | '30d') => void;
}) {
  return (
    <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
      {(['7d', '30d'] as const).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            range === r
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {r === '7d' ? '7 Days' : '30 Days'}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user, currentSchool } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';
  const [attendanceRange, setAttendanceRange] = useState<'7d' | '30d'>('7d');

  const firstName = (user?.displayName || 'Admin').split(' ')[0];

  // ── Data fetching via React Query ──
  const { data: students = [], isLoading: studentsLoading, dataUpdatedAt } = useApiQuery<Student[]>({
    queryKey: ['students', schoolId],
    path: '/students',
    enabled: !!schoolId,
  });

  const { data: teachers = [], isLoading: teachersLoading } = useApiQuery<Teacher[]>({
    queryKey: ['teachers', schoolId],
    path: '/teachers',
    enabled: !!schoolId,
  });

  const { data: fees = [], isLoading: feesLoading } = useApiQuery<Fee[]>({
    queryKey: ['fees', schoolId],
    path: '/fees',
    enabled: !!schoolId,
  });

  const { data: events = [], isLoading: eventsLoading } = useApiQuery<Event[]>({
    queryKey: ['events', schoolId],
    path: '/events?limit=1000',
    enabled: !!schoolId,
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useApiQuery<Attendance[]>({
    queryKey: ['attendance', schoolId],
    path: '/attendance',
    enabled: !!schoolId,
  });

  const { data: classes = [], isLoading: classesLoading } = useApiQuery<any[]>({
    queryKey: ['classes', schoolId],
    path: '/classes/all',
    enabled: !!schoolId,
  });

  const loading = studentsLoading || teachersLoading || feesLoading || eventsLoading || attendanceLoading || classesLoading;
  const lastSync = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();

  // ── Derived stats ──
  const activeStudents = students.filter((s) => s.isActive);
  const activeTeachers = teachers.filter((t) => t.isActive);
  const activeClasses = classes.filter((c: Class) => c.isActive);
  const totalStudents = activeStudents.length;
  const totalTeachers = activeTeachers.length;
  const totalClasses = activeClasses.length;

  // Today attendance
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayAttendance = attendance.filter((a) => {
    try { return format(new Date(a.date), 'yyyy-MM-dd') === today; } catch { return false; }
  });
  const presentToday = todayAttendance.filter((a) => a.status === 'Present' || a.status === 'Late').length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentToday / totalStudents) * 100) : 0;

  // Fee stats
  const totalCollected = fees.filter((f) => f.status === 'Paid').reduce((sum, f) => sum + (f.amountPaid || f.amount), 0);
  const totalPending = fees.filter((f) => f.status === 'Pending' || f.status === 'Overdue').reduce((sum, f) => sum + f.amount - (f.amountPaid || 0), 0);
  const feeCollectionRate = (totalCollected + totalPending) > 0 ? Math.round((totalCollected / (totalCollected + totalPending)) * 100) : 0;

  // ── Attendance chart data (7d / 30d toggle) ──
  const attendanceChartData = useMemo(() => {
    const now = new Date();
    const days = attendanceRange === '7d' ? 7 : 30;
    const labels: string[] = [];
    const dataPoints: { day: string; rate: number; present: number; total: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const label = attendanceRange === '7d' ? format(d, 'EEE') : format(d, 'dd MMM');
      const dayRecords = attendance.filter((a) => {
        try { return format(new Date(a.date), 'yyyy-MM-dd') === dateStr; } catch { return false; }
      });
      const present = dayRecords.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      const total = dayRecords.length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;
      dataPoints.push({ day: label, rate, present, total });
    }
    return dataPoints;
  }, [attendance, attendanceRange]);

  // ── Fee collection chart data (rolling 6 months) ──
  const feeChartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = subDays(now, (5 - i) * 30);
      const monthLabel = format(d, 'MMM');
      const monthKey = format(d, 'yyyy-MM');
      const monthFees = fees.filter((f) => {
        try { return format(new Date(f.createdAt), 'yyyy-MM') === monthKey; } catch { return false; }
      });
      const collected = Math.round(monthFees.filter((f) => f.status === 'Paid').reduce((s, f) => s + f.amount, 0) / 1000);
      const pending = Math.round(monthFees.filter((f) => f.status !== 'Paid').reduce((s, f) => s + f.amount, 0) / 1000);
      return { month: monthLabel, collected, pending };
    });
  }, [fees]);

  // ── Upcoming events ──
  const upcomingEvents = useMemo(() =>
    events
      .filter((e) => e.isActive && new Date(e.eventDate) >= new Date())
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime())
      .slice(0, 4),
    [events]
  );

  // ── Recent activities (derived from live data) ──
  const recentActivities = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    if (todayAttendance.length > 0) {
      items.push({ type: 'attendance', text: `Attendance marked — ${presentToday} present out of ${todayAttendance.length} today`, time: format(new Date(), 'h:mm a') });
    }
    // Show recent fee payments
    const recentFees = fees
      .filter((f) => f.status === 'Paid' && f.paidDate)
      .sort((a, b) => new Date(b.paidDate || b.createdAt).getTime() - new Date(a.paidDate || a.createdAt).getTime())
      .slice(0, 2);
    recentFees.forEach((f) => {
      items.push({ type: 'payment', text: `Fee payment ${formatCurrency(f.amount)} from ${f.studentName || 'Student'}`, time: format(new Date(f.paidDate || f.createdAt), 'dd MMM, h:mm a') });
    });
    // Show upcoming events
    upcomingEvents.slice(0, 2).forEach((e) => {
      items.push({ type: 'assignment', text: `${e.title} — ${format(new Date(e.eventDate), 'dd MMM')}`, time: 'Upcoming' });
    });
    return items.slice(0, 6);
  }, [fees, todayAttendance, presentToday, upcomingEvents]);

  // ── Average attendance over current range for badge ──
  const avgAttendance = useMemo(() => {
    const rates = attendanceChartData.map((d) => d.rate);
    return rates.length > 0 ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;
  }, [attendanceChartData]);

  return (
    <DashboardLayout>
      <div className="space-y-8">

        {/* ── Greeting + Live Sync ──────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {firstName}!
            </h1>
            <p className="text-base text-slate-500 mt-1.5">
              Here&apos;s what&apos;s happening at {currentSchool?.name || 'your school'} today.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200" suppressHydrationWarning>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-700">Live</span>
            <span className="text-xs text-emerald-600 tabular-nums" suppressHydrationWarning>{format(lastSync, 'HH:mm:ss')}</span>
          </div>
        </div>

        {/* ── Stat Cards ───────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Students"
            value={totalStudents}
            icon={Users}
            color="blue"
            loading={loading}
          />
          <StatCard
            title="Total Teachers"
            value={totalTeachers}
            icon={GraduationCap}
            color="emerald"
            loading={loading}
          />
          <StatCard
            title="Active Classes"
            value={totalClasses}
            icon={School}
            color="violet"
            subtitle="Across all grades"
            loading={loading}
          />
          <StatCard
            title="Present Today"
            value={presentToday}
            icon={ClipboardCheck}
            color="amber"
            suffix={` / ${totalStudents}`}
            subtitle={`${attendanceRate}% attendance rate`}
            loading={loading}
          />
        </div>

        {/* ── Charts Row ───────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-800">Analytics</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Attendance Analytics */}
          <ChartCard
            title="Attendance Analytics"
            icon={TrendingUp}
            color="blue"
            loading={loading}
            badge={
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-emerald-600">{avgAttendance}% avg</span>
              </div>
            }
            headerRight={
              <RangeToggle range={attendanceRange} onChange={setAttendanceRange} />
            }
          >
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={attendanceChartData}>
                <defs>
                  <linearGradient id="attendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval={attendanceRange === '30d' ? 4 : 0}
                />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[70, 100]} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="rate"
                  name="Attendance"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fill="url(#attendGrad)"
                  dot={attendanceRange === '7d' ? { fill: '#2563eb', r: 4, strokeWidth: 2, stroke: '#fff' } : false}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Fee Collection */}
          <ChartCard
            title="Fee Collection"
            icon={IndianRupee}
            color="amber"
            loading={loading}
            headerRight={
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-400" /> Collected
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Pending
                </span>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={feeChartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="collected" name="Collected" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={24} />
                <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[6, 6, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          </div>
        </div>

        {/* ── Fee Summary Row ──────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-800">Financial Overview</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Total Collected */}
          <div
            className="bg-emerald-50 rounded-xl border border-emerald-200 overflow-hidden"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-200 bg-emerald-100">
              <div className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-800">
                <IndianRupee className="w-4 h-4 text-emerald-500" />
                Total Collected
              </div>
            </div>
            <div className="p-6">
              <p className="text-[28px] font-semibold text-slate-900 tabular-nums">
                <AnimatedCounter value={totalCollected} formatter={(v) => formatCurrency(v)} />
              </p>
              <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${feeCollectionRate}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">{feeCollectionRate}% collection rate</p>
            </div>
          </div>

          {/* Pending Fees */}
          <div
            className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-amber-200 bg-amber-100">
              <div className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-800">
                <Clock className="w-4 h-4 text-amber-500" />
                Pending Fees
              </div>
            </div>
            <div className="p-6">
              <p className="text-[28px] font-semibold text-slate-900 tabular-nums">
                <AnimatedCounter value={totalPending} formatter={(v) => formatCurrency(v)} />
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <p className="text-xs text-amber-600 font-medium">Requires follow-up</p>
              </div>
            </div>
          </div>

          {/* Today's Attendance */}
          <div
            className="bg-blue-50 rounded-xl border border-blue-200 overflow-hidden"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-blue-200 bg-blue-100">
              <div className="flex items-center gap-2.5 text-[15px] font-semibold text-slate-800">
                <ClipboardCheck className="w-4 h-4 text-blue-500" />
                Attendance Today
              </div>
            </div>
            <div className="p-6">
              <p className="text-[28px] font-semibold text-slate-900 tabular-nums">
                <AnimatedCounter value={attendanceRate} suffix="%" />
              </p>
              <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {presentToday} of {totalStudents} students present
              </p>
            </div>
          </div>
          </div>
        </div>

        {/* ── Events & Activity ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Upcoming Events — 2 cols */}
          <div className="lg:col-span-2">
            <ChartCard
              title="Upcoming Events"
              icon={CalendarDays}
              color="violet"
              loading={loading}
            >
              <EventsList events={upcomingEvents} loading={false} />
            </ChartCard>
          </div>

          {/* Recent Activity — 3 cols */}
          <div className="lg:col-span-3">
            <ChartCard
              title="Recent Activity"
              icon={Clock}
              color="blue"
              loading={loading}
              headerRight={
                <button className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-400 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
            >
              <ActivityFeed activities={recentActivities} loading={false} />
            </ChartCard>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
