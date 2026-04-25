'use client';

import { useState, useMemo } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ChartCard from '@/components/dashboard/ChartCard';
import AnimatedCounter from '@/components/dashboard/AnimatedCounter';
import { exportReportWithStats } from '@/services/exportService';
import { formatCurrency, formatCurrencyCompact } from '@/lib/designTokens';
import { useAuthStore } from '@/store/authStore';

import { Student, Teacher, Class, Fee, Attendance, Result, Event } from '@/types';
import { useApiQuery } from '@/hooks/useApiQuery';
import {
  computeGradeDistribution,
  computeClassPerformance,
  computeSubjectPerformance,
  computeStudentRankings,
  computeAttendanceTrends,
  computeClassAttendanceRates,
  computeMonthlyFees,
  computeFeeDefaulters,
  computeFeeTypeBreakdown,
  computeAtRiskStudents,
  computeFeeCollectionForecast,
  computeAttendancePrediction,
  computeExamScoreDistribution,
  GradeDistribution,
  ClassPerformance,
  AttendanceTrend,
  MonthlyFeeData,
  SubjectPerformance,
  StudentRanking,
  AtRiskStudent,
  FeeDefaulter,
} from '@/lib/analyticsUtils';
import {
  Users, GraduationCap, IndianRupee, BookOpen, TrendingUp, TrendingDown,
  BarChart3, Calendar, Award, Download, PieChart, Activity,
  CheckCircle, AlertTriangle, Clock, RefreshCw, Target, Brain,
  ArrowUpRight, ArrowDownRight, Minus, Shield, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import Button from '@/components/common/Button';
import Select from '@/components/common/Select';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

/* ------------------------------------------------------------------ */
/*  Tab config                                                         */
/* ------------------------------------------------------------------ */

type TabId = 'overview' | 'academic' | 'attendance' | 'financial';

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'academic', label: 'Academic', icon: Award },
  { id: 'attendance', label: 'Attendance', icon: Activity },
  { id: 'financial', label: 'Financial', icon: IndianRupee },
];

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
    <div className="bg-white px-3 py-2.5 rounded-lg border border-slate-200 text-xs" style={{ boxShadow: '0 8px 24px -4px rgba(0,0,0,0.1)' }}>
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p: ChartTooltipEntry, i: number) => (
        <p key={i} className="text-slate-500">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-slate-700">
            {typeof p.value === 'number' && p.value > 999
              ? formatCurrencyCompact(p.value)
              : p.dataKey === 'rate' || p.dataKey === 'passRate' || p.dataKey === 'collectionRate'
                ? `${p.value}%`
                : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Insight card                                                       */
/* ------------------------------------------------------------------ */

function InsightCard({ icon: Icon, title, value, subtitle, color, trend }: {
  icon: typeof TrendingUp;
  title: string;
  value: string | number;
  subtitle: string;
  color: 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'sky';
  trend?: 'up' | 'down' | 'neutral';
}) {
  const colorMap = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', iconBg: 'bg-blue-100' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', iconBg: 'bg-emerald-100' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', iconBg: 'bg-amber-100' },
    violet: { bg: 'bg-violet-50', border: 'border-violet-200', icon: 'text-violet-600', iconBg: 'bg-violet-100' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-200', icon: 'text-rose-600', iconBg: 'bg-rose-100' },
    sky: { bg: 'bg-sky-50', border: 'border-sky-200', icon: 'text-sky-600', iconBg: 'bg-sky-100' },
  };
  const c = colorMap[color];

  return (
    <div className={`${c.bg} rounded-xl border ${c.border} p-5`} style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'
          }`}>
            {trend === 'up' ? <ArrowUpRight className="w-3.5 h-3.5" /> :
             trend === 'down' ? <ArrowDownRight className="w-3.5 h-3.5" /> :
             <Minus className="w-3.5 h-3.5" />}
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  useDocumentTitle('Reports');
  const { currentSchool, user } = useAuthStore();
  const schoolId = currentSchool?.id || user?.schoolId || '';

  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // "- Data fetching via React Query (7 parallel queries) "-
  const { data: students = [], isLoading: studentsLoading } = useApiQuery<Student[]>({ queryKey: ['students', schoolId], path: '/students' });
  const { data: teachers = [], isLoading: teachersLoading } = useApiQuery<Teacher[]>({ queryKey: ['teachers', schoolId], path: '/teachers' });
  const { data: classes = [], isLoading: classesLoading } = useApiQuery<Class[]>({ queryKey: ['classes', schoolId], path: '/classes/all' });
  const { data: fees = [], isLoading: feesLoading } = useApiQuery<Fee[]>({ queryKey: ['fees', schoolId], path: '/fees' });
  const { data: attendance = [], isLoading: attendanceLoading } = useApiQuery<Attendance[]>({ queryKey: ['attendance', schoolId], path: '/attendance' });
  const { data: results = [], isLoading: resultsLoading } = useApiQuery<Result[]>({ queryKey: ['results'], path: '/results?limit=1000' });
  const { data: events = [], isLoading: eventsLoading, dataUpdatedAt } = useApiQuery<Event[]>({ queryKey: ['events', schoolId], path: '/events?limit=1000' });

  const loading = studentsLoading || teachersLoading || classesLoading || feesLoading || attendanceLoading || resultsLoading || eventsLoading;
  const lastSynced = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // Filters
  const [classFilter, setClassFilter] = useState('all');
  const [examFilter, setExamFilter] = useState('all');
  const filteredResults = useMemo(() => {
    let r = results;
    if (classFilter !== 'all') r = r.filter((x) => x.classId === classFilter);
    if (examFilter !== 'all') r = r.filter((x) => x.examType === examFilter);
    return r;
  }, [results, classFilter, examFilter]);

  const filteredAttendance = useMemo(() => {
    if (classFilter === 'all') return attendance;
    return attendance.filter((a) => a.classId === classFilter);
  }, [attendance, classFilter]);

  const filteredFees = useMemo(() => {
    if (classFilter === 'all') return fees;
    return fees.filter((f) => f.classId === classFilter);
  }, [fees, classFilter]);

  // "- Core computed stats "-----------------------------------------
  const activeStudents = useMemo(() => students.filter((s) => s.isActive).length, [students]);
  const activeTeachers = useMemo(() => teachers.filter((t) => t.isActive).length, [teachers]);
  const totalFeeAmount = useMemo(() => filteredFees.reduce((s, f) => s + (f.amount || 0), 0), [filteredFees]);
  const collectedFees = useMemo(() =>
    filteredFees.filter((f) => f.status === 'Paid').reduce((s, f) => s + f.amount, 0) +
    filteredFees.filter((f) => f.status === 'Partial').reduce((s, f) => s + (f.amountPaid || 0), 0),
  [filteredFees]);
  const attendanceRate = useMemo(() => {
    if (filteredAttendance.length === 0) return 0;
    return Math.round((filteredAttendance.filter((a) => a.status === 'Present' || a.status === 'Late').length / filteredAttendance.length) * 100);
  }, [filteredAttendance]);
  const passRate = useMemo(() => {
    if (filteredResults.length === 0) return 0;
    return Math.round((filteredResults.filter((r) => r.status === 'Pass').length / filteredResults.length) * 100);
  }, [filteredResults]);
  const avgPercentage = useMemo(() => {
    if (filteredResults.length === 0) return 0;
    return Math.round(filteredResults.reduce((s, r) => s + (r.percentage || 0), 0) / filteredResults.length);
  }, [filteredResults]);

  // "- Analytics computations "--------------------------------------
  const gradeDistribution = useMemo(() => computeGradeDistribution(filteredResults), [filteredResults]);
  const classPerformance = useMemo(() => computeClassPerformance(filteredResults, classes), [filteredResults, classes]);
  const subjectPerformance = useMemo(() => computeSubjectPerformance(filteredResults), [filteredResults]);
  const studentRankings = useMemo(() => computeStudentRankings(filteredResults), [filteredResults]);
  const attendanceTrends30d = useMemo(() => computeAttendanceTrends(filteredAttendance, 30), [filteredAttendance]);
  const attendanceTrends7d = useMemo(() => computeAttendanceTrends(filteredAttendance, 7), [filteredAttendance]);
  const classAttendance = useMemo(() => computeClassAttendanceRates(filteredAttendance, classes), [filteredAttendance, classes]);
  const monthlyFees = useMemo(() => computeMonthlyFees(filteredFees, 6), [filteredFees]);
  const feeDefaulters = useMemo(() => computeFeeDefaulters(filteredFees), [filteredFees]);
  const feeTypeBreakdown = useMemo(() => computeFeeTypeBreakdown(filteredFees), [filteredFees]);
  const atRiskStudents = useMemo(() => computeAtRiskStudents(students, filteredAttendance, filteredResults), [students, filteredAttendance, filteredResults]);
  const feeForecast = useMemo(() => computeFeeCollectionForecast(filteredFees), [filteredFees]);
  const attendancePrediction = useMemo(() => computeAttendancePrediction(filteredAttendance), [filteredAttendance]);
  const scoreDistribution = useMemo(() => computeExamScoreDistribution(filteredResults), [filteredResults]);

  // Unique exam types for filter
  const examTypes = useMemo(() => {
    const types = Array.from(new Set(results.map((r) => r.examType))).filter(Boolean);
    return [{ value: 'all', label: 'All Exams' }, ...types.map((t) => ({ value: t, label: t }))];
  }, [results]);

  const classOptions = useMemo(() => {
    const opts = classes.map((c) => ({ value: c.id, label: c.className }));
    return [{ value: 'all', label: 'All Classes' }, ...opts];
  }, [classes]);

  const classMap = useMemo(
    () => Object.fromEntries(classes.map(c => [c.id, c.className])) as Record<string, string>,
    [classes],
  );

  // "- Export handler "----------------------------------------------
  const handleExportReport = () => {
    exportReportWithStats({
      title: `Analytics Report - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`,
      schoolName: currentSchool?.name || 'SuffaCampus School',
      headers: ['Metric', 'Value'],
      rows: [
        ['Total Students', `${students.length} (Active: ${activeStudents})`],
        ['Total Teachers', `${teachers.length} (Active: ${activeTeachers})`],
        ['Total Classes', classes.length.toString()],
        ['Attendance Rate', `${attendanceRate}%`],
        ['Pass Rate', `${passRate}%`],
        ['Average Score', `${avgPercentage}%`],
        ['Fee Collection Rate', `${totalFeeAmount > 0 ? Math.round((collectedFees / totalFeeAmount) * 100) : 0}%`],
        ['At-Risk Students', atRiskStudents.length.toString()],
        ...classPerformance.map((c) => [c.className, `Avg: ${c.avgPercentage}% | Pass: ${c.passRate}%`]),
      ],
      stats: [
        { label: 'Total Fees', value: formatCurrency(totalFeeAmount) },
        { label: 'Collected', value: formatCurrency(collectedFees) },
        { label: 'Pending', value: formatCurrency(totalFeeAmount - collectedFees) },
        { label: 'Forecast', value: formatCurrency(feeForecast.projected) },
      ],
      filename: `analytics-${activeTab}-${format(new Date(), 'yyyy-MM-dd')}`,
    });
    toast.success('Report exported');
  };

  // "- Loading state "-----------------------------------------------
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-12 h-12 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* "- Header "------------------------------------- */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Analytics & Insights</h1>
            <p className="text-base text-slate-500 mt-1">Data-driven visibility across academics, attendance, and finances</p>
            {lastSynced && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-500 mt-2">
                <RefreshCw className="w-3 h-3" />Live synced {format(lastSynced, 'hh:mm:ss a')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40">
              <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} options={classOptions} />
            </div>
            {(activeTab === 'academic' || activeTab === 'overview') && (
              <div className="w-40">
                <Select value={examFilter} onChange={(e) => setExamFilter(e.target.value)} options={examTypes} />
              </div>
            )}
            <Button onClick={handleExportReport}>
              <Download className="w-4 h-4" />
              <span>Export</span>
            </Button>
          </div>
        </div>

        {/* "- Tab Navigation "----------------------------- */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* "- Tab Content "-------------------------------- */}
        {activeTab === 'overview' && (
          <OverviewTab
            students={students} activeStudents={activeStudents} teachers={teachers} activeTeachers={activeTeachers}
            classes={classes} attendanceRate={attendanceRate} passRate={passRate} avgPercentage={avgPercentage}
            collectedFees={collectedFees} totalFeeAmount={totalFeeAmount}
            gradeDistribution={gradeDistribution} classPerformance={classPerformance}
            attendanceTrends={attendanceTrends7d} monthlyFees={monthlyFees}
            atRiskStudents={atRiskStudents} feeForecast={feeForecast}
            attendancePrediction={attendancePrediction} classMap={classMap}
          />
        )}
        {activeTab === 'academic' && (
          <AcademicTab
            results={filteredResults} gradeDistribution={gradeDistribution}
            classPerformance={classPerformance} subjectPerformance={subjectPerformance}
            studentRankings={studentRankings} scoreDistribution={scoreDistribution}
            passRate={passRate} avgPercentage={avgPercentage} classMap={classMap}
          />
        )}
        {activeTab === 'attendance' && (
          <AttendanceTab
            attendance={filteredAttendance} attendanceTrends30d={attendanceTrends30d}
            attendanceTrends7d={attendanceTrends7d} classAttendance={classAttendance}
            attendancePrediction={attendancePrediction} attendanceRate={attendanceRate}
            students={students}
          />
        )}
        {activeTab === 'financial' && (
          <FinancialTab
            fees={filteredFees} monthlyFees={monthlyFees} feeDefaulters={feeDefaulters}
            feeTypeBreakdown={feeTypeBreakdown} feeForecast={feeForecast}
            collectedFees={collectedFees} totalFeeAmount={totalFeeAmount} classMap={classMap}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

/* ==================================================================
   OVERVIEW TAB
   ================================================================== */

interface OverviewTabProps {
  students: Student[];
  activeStudents: number;
  teachers: Teacher[];
  activeTeachers: number;
  classes: Class[];
  attendanceRate: number;
  passRate: number;
  avgPercentage: number;
  collectedFees: number;
  totalFeeAmount: number;
  gradeDistribution: GradeDistribution[];
  classPerformance: ClassPerformance[];
  attendanceTrends: AttendanceTrend[];
  monthlyFees: MonthlyFeeData[];
  atRiskStudents: AtRiskStudent[];
  feeForecast: { projected: number; confidence: number };
  attendancePrediction: { predictedRate: number; trend: 'improving' | 'declining' | 'stable' };
  classMap: Record<string, string>;
}

function OverviewTab({
  students, activeStudents, teachers, activeTeachers, classes,
  attendanceRate, passRate, avgPercentage, collectedFees, totalFeeAmount,
  gradeDistribution, classPerformance, attendanceTrends, monthlyFees,
  atRiskStudents, feeForecast, attendancePrediction, classMap,
}: OverviewTabProps) {
  const collectionRate = totalFeeAmount > 0 ? Math.round((collectedFees / totalFeeAmount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard icon={Users} title="Students" value={students.length} subtitle={`${activeStudents} active`} color="blue" />
        <InsightCard icon={Activity} title="Attendance" value={`${attendanceRate}%`} subtitle={attendancePrediction.trend === 'improving' ? 'Trending up' : attendancePrediction.trend === 'declining' ? 'Trending down' : 'Stable'} color="emerald" trend={attendancePrediction.trend === 'improving' ? 'up' : attendancePrediction.trend === 'declining' ? 'down' : 'neutral'} />
        <InsightCard icon={Award} title="Pass Rate" value={`${passRate}%`} subtitle={`${avgPercentage}% avg score`} color="violet" />
        <InsightCard icon={IndianRupee} title="Collected" value={formatCurrency(collectedFees)} subtitle={`${collectionRate}% of ${formatCurrencyCompact(totalFeeAmount)}`} color="amber" />
      </div>

      {/* Predictive Insights Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-violet-50 to-amber-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Predictive Insights</h3>
          <span className="text-[10px] font-medium text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full uppercase tracking-wide">AI</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/70 rounded-lg border border-white p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Predicted Attendance</p>
            <p className="text-xl font-semibold text-slate-900">{attendancePrediction.predictedRate}%</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              {attendancePrediction.trend === 'improving' ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : attendancePrediction.trend === 'declining' ? <TrendingDown className="w-3 h-3 text-red-500" /> : <Minus className="w-3 h-3 text-slate-400" />}
              {attendancePrediction.trend === 'improving' ? 'Improving trend' : attendancePrediction.trend === 'declining' ? 'Declining trend' : 'Stable'}
            </p>
          </div>
          <div className="bg-white/70 rounded-lg border border-white p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">Fee Collection Forecast</p>
            <p className="text-xl font-semibold text-slate-900">{formatCurrency(feeForecast.projected)}</p>
            <p className="text-xs text-slate-400 mt-1">{feeForecast.confidence}% confidence</p>
          </div>
          <div className="bg-white/70 rounded-lg border border-white p-4">
            <p className="text-xs font-medium text-slate-500 mb-1">At-Risk Students</p>
            <p className="text-xl font-semibold text-slate-900">{atRiskStudents.length}</p>
            <p className="text-xs text-slate-400 mt-1">
              {atRiskStudents.filter((s: AtRiskStudent) => s.riskLevel === 'high').length} high risk
            </p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Trend */}
        <ChartCard title="Attendance - Last 7 Days" icon={TrendingUp} color="blue" loading={false}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={attendanceTrends}>
              <defs>
                <linearGradient id="overviewAttGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="rate" name="Attendance %" stroke="#2563eb" strokeWidth={2.5} fill="url(#overviewAttGrad)" dot={{ fill: '#2563eb', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Grade Distribution */}
        <ChartCard title="Grade Distribution" icon={PieChart} color="violet" loading={false}>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="55%" height={240}>
              <RechartsPie>
                <Pie data={gradeDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="count" nameKey="grade">
                  {gradeDistribution.map((entry: GradeDistribution, i: number) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </RechartsPie>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {gradeDistribution.map((g: GradeDistribution) => (
                <div key={g.grade} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-xs text-slate-600 flex-1">{g.grade}</span>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">{g.count}</span>
                  <span className="text-xs text-slate-400 tabular-nums w-10 text-right">{g.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Class Performance */}
        <ChartCard title="Class Performance Comparison" icon={BarChart3} color="emerald" loading={false}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={classPerformance.slice(0, 8)} layout="vertical" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis dataKey="className" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avgPercentage" name="Avg Score %" fill="#10b981" radius={[0, 6, 6, 0]} barSize={18} />
              <Bar dataKey="passRate" name="Pass Rate %" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Fee Collection Trend */}
        <ChartCard title="Monthly Fee Collection" icon={IndianRupee} color="amber" loading={false}
          headerRight={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Collected</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Pending</span>
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyFees} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="monthLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `Rs.${Math.round(v / 1000)}K`} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[6, 6, 0, 0]} barSize={20} />
              <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[6, 6, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* At-Risk Students */}
      {atRiskStudents.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-red-50">
            <Shield className="w-4 h-4 text-red-500" />
            <h3 className="text-[14px] font-semibold text-slate-700">At-Risk Students</h3>
            <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full ml-auto">{atRiskStudents.length} identified</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Student</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Class</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Attendance</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Avg Score</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Risk Factors</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Level</th>
                </tr>
              </thead>
              <tbody>
                {atRiskStudents.slice(0, 8).map((s: AtRiskStudent) => (
                  <tr key={s.studentId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-slate-700">{s.studentName}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{classMap[s.classId] || s.classId}-{s.sectionId}</td>
                    <td className="px-5 py-3 text-sm text-center tabular-nums">
                      <span className={`font-medium ${s.attendanceRate < 60 ? 'text-red-600' : s.attendanceRate < 75 ? 'text-amber-600' : 'text-slate-600'}`}>{s.attendanceRate}%</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-center tabular-nums">
                      <span className={`font-medium ${s.avgPercentage < 40 ? 'text-red-600' : s.avgPercentage < 60 ? 'text-amber-600' : 'text-slate-600'}`}>{s.avgPercentage >= 0 ? `${s.avgPercentage}%` : '-'}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.riskFactors.map((f: string, i: number) => (
                          <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">{f}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        s.riskLevel === 'high' ? 'bg-red-100 text-red-700' :
                        s.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {s.riskLevel.charAt(0).toUpperCase() + s.riskLevel.slice(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   ACADEMIC TAB
   ================================================================== */

interface AcademicTabProps {
  results: Result[];
  gradeDistribution: GradeDistribution[];
  classPerformance: ClassPerformance[];
  subjectPerformance: SubjectPerformance[];
  studentRankings: { top: StudentRanking[]; bottom: StudentRanking[] };
  scoreDistribution: { range: string; count: number; color: string }[];
  passRate: number;
  avgPercentage: number;
  classMap: Record<string, string>;
}

function AcademicTab({
  results, gradeDistribution, classPerformance, subjectPerformance,
  studentRankings, scoreDistribution, passRate, avgPercentage, classMap,
}: AcademicTabProps) {
  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard icon={Award} title="Pass Rate" value={`${passRate}%`} subtitle={`${results.length} total results`} color="emerald" />
        <InsightCard icon={Target} title="Average Score" value={`${avgPercentage}%`} subtitle="Across all exams" color="blue" />
        <InsightCard icon={TrendingUp} title="Top Score" value={`${results.length > 0 ? Math.max(...results.map((r: Result) => r.percentage || 0)) : 0}%`} subtitle="Highest achieved" color="violet" />
        <InsightCard icon={AlertTriangle} title="Failed" value={results.filter((r: Result) => r.status === 'Fail').length} subtitle="Needs attention" color="rose" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <ChartCard title="Score Range Distribution" icon={BarChart3} color="blue" loading={false}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="range" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Students" radius={[6, 6, 0, 0]} barSize={32}>
                {scoreDistribution.map((entry: { range: string; count: number; color: string }, i: number) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Grade Pie */}
        <ChartCard title="Grade Distribution" icon={PieChart} color="violet" loading={false}>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="55%" height={260}>
              <RechartsPie>
                <Pie data={gradeDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3} dataKey="count" nameKey="grade">
                  {gradeDistribution.map((entry: GradeDistribution, i: number) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </RechartsPie>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {gradeDistribution.map((g: GradeDistribution) => (
                <div key={g.grade} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="text-sm text-slate-600 flex-1 font-medium">Grade {g.grade}</span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">{g.count}</span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Subject Performance Radar + Class Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Subject Performance" icon={BookOpen} color="emerald" loading={false}>
          {subjectPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={subjectPerformance.slice(0, 8)}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Radar name="Avg %" dataKey="avgPercentage" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Pass Rate %" dataKey="passRate" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                <Tooltip content={<ChartTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-sm text-slate-400">No subject data available</div>
          )}
        </ChartCard>

        <ChartCard title="Class-wise Performance" icon={BarChart3} color="sky" loading={false}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={classPerformance.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="className" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avgPercentage" name="Avg Score %" fill="#0ea5e9" radius={[6, 6, 0, 0]} barSize={22} />
              <Bar dataKey="passRate" name="Pass Rate %" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Student Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-emerald-100 bg-emerald-50">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h3 className="text-[14px] font-semibold text-slate-700">Top Performers</h3>
            <span className="text-xs text-emerald-600 ml-auto">Top 10</span>
          </div>
          <div className="divide-y divide-slate-50">
            {studentRankings.top.map((s: StudentRanking, i: number) => (
              <div key={s.studentId} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-yellow-100 text-yellow-700' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-500'
                }`}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{s.studentName}</p>
                  <p className="text-xs text-slate-400">{classMap[s.classId] || s.classId}-{s.sectionId} - {s.totalExams} exams</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-600 tabular-nums">{s.avgPercentage}%</p>
                  <p className="text-xs text-slate-400">{s.passRate}% pass</p>
                </div>
              </div>
            ))}
            {studentRankings.top.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No results data available</div>
            )}
          </div>
        </div>

        {/* Needs Improvement */}
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-amber-100 bg-amber-50">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-[14px] font-semibold text-slate-700">Needs Improvement</h3>
            <span className="text-xs text-amber-600 ml-auto">Bottom 10</span>
          </div>
          <div className="divide-y divide-slate-50">
            {studentRankings.bottom.map((s: StudentRanking, i: number) => (
              <div key={s.studentId} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-xs font-medium text-red-500">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{s.studentName}</p>
                  <p className="text-xs text-slate-400">{classMap[s.classId] || s.classId}-{s.sectionId} - {s.totalExams} exams</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold tabular-nums ${s.avgPercentage < 40 ? 'text-red-600' : 'text-amber-600'}`}>{s.avgPercentage}%</p>
                  <p className="text-xs text-slate-400">{s.passRate}% pass</p>
                </div>
              </div>
            ))}
            {studentRankings.bottom.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">No results data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Subject Detail Table */}
      {subjectPerformance.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            <BookOpen className="w-4 h-4 text-blue-600" />
            <h3 className="text-[14px] font-semibold text-slate-700">Subject-wise Analysis</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Subject</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Results</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Avg %</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Pass Rate</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Highest</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Lowest</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Performance</th>
                </tr>
              </thead>
              <tbody>
                {subjectPerformance.map((s: SubjectPerformance) => (
                  <tr key={s.subject} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-slate-700">{s.subject}</td>
                    <td className="px-5 py-3 text-sm text-center text-slate-500 tabular-nums">{s.resultCount}</td>
                    <td className="px-5 py-3 text-sm text-center font-medium tabular-nums">
                      <span className={s.avgPercentage >= 70 ? 'text-emerald-600' : s.avgPercentage >= 50 ? 'text-amber-600' : 'text-red-600'}>{s.avgPercentage}%</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-center font-medium tabular-nums">
                      <span className={s.passRate >= 80 ? 'text-emerald-600' : s.passRate >= 60 ? 'text-amber-600' : 'text-red-600'}>{s.passRate}%</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-center text-emerald-600 font-medium tabular-nums">{s.highestScore}%</td>
                    <td className="px-5 py-3 text-sm text-center text-red-500 font-medium tabular-nums">{s.lowestScore}%</td>
                    <td className="px-5 py-3">
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${s.avgPercentage >= 70 ? 'bg-emerald-500' : s.avgPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${s.avgPercentage}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   ATTENDANCE TAB
   ================================================================== */

interface AttendanceTabProps {
  attendance: Attendance[];
  attendanceTrends30d: AttendanceTrend[];
  attendanceTrends7d: AttendanceTrend[];
  classAttendance: { classId: string; className: string; rate: number; total: number }[];
  attendancePrediction: { predictedRate: number; trend: 'improving' | 'declining' | 'stable' };
  attendanceRate: number;
  students: Student[];
}

function AttendanceTab({
  attendance, attendanceTrends30d, attendanceTrends7d, classAttendance,
  attendancePrediction, attendanceRate, students,
}: AttendanceTabProps) {
  const [range, setRange] = useState<'7d' | '30d'>('30d');
  const trends = range === '7d' ? attendanceTrends7d : attendanceTrends30d;

  const statusDist = useMemo(() => {
    const present = attendance.filter((a: Attendance) => a.status === 'Present').length;
    const absent = attendance.filter((a: Attendance) => a.status === 'Absent').length;
    const late = attendance.filter((a: Attendance) => a.status === 'Late').length;
    const excused = attendance.filter((a: Attendance) => a.status === 'Excused').length;
    return [
      { name: 'Present', value: present, color: '#10b981' },
      { name: 'Absent', value: absent, color: '#ef4444' },
      { name: 'Late', value: late, color: '#f59e0b' },
      { name: 'Excused', value: excused, color: '#3b82f6' },
    ];
  }, [attendance]);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard icon={CheckCircle} title="Present Rate" value={`${attendanceRate}%`} subtitle={`${attendance.filter((a: Attendance) => a.status === 'Present').length} present`} color="emerald" />
        <InsightCard icon={AlertTriangle} title="Absent" value={attendance.filter((a: Attendance) => a.status === 'Absent').length} subtitle={`${attendance.length > 0 ? Math.round((attendance.filter((a: Attendance) => a.status === 'Absent').length / attendance.length) * 100) : 0}% absence rate`} color="rose" />
        <InsightCard icon={Clock} title="Late" value={attendance.filter((a: Attendance) => a.status === 'Late').length} subtitle="Tardy arrivals" color="amber" />
        <InsightCard icon={Brain} title="Prediction" value={`${attendancePrediction.predictedRate}%`} subtitle={attendancePrediction.trend === 'improving' ? 'Improving' : attendancePrediction.trend === 'declining' ? 'Declining' : 'Stable'} color="violet" trend={attendancePrediction.trend === 'improving' ? 'up' : attendancePrediction.trend === 'declining' ? 'down' : 'neutral'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard
            title="Attendance Trend"
            icon={TrendingUp}
            color="blue"
            loading={false}
            headerRight={
              <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
                {(['7d', '30d'] as const).map((r) => (
                  <button key={r} onClick={() => setRange(r)} className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${range === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                    {r === '7d' ? '7 Days' : '30 Days'}
                  </button>
                ))}
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="attTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} interval={range === '30d' ? 4 : 0} />
                <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="rate" name="Attendance %" stroke="#2563eb" strokeWidth={2.5} fill="url(#attTrendGrad)" dot={range === '7d' ? { fill: '#2563eb', r: 4, strokeWidth: 2, stroke: '#fff' } : false} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Status Breakdown Pie */}
        <ChartCard title="Status Breakdown" icon={PieChart} color="emerald" loading={false}>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <RechartsPie>
                <Pie data={statusDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                  {statusDist.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </RechartsPie>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {statusDist.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-500">{s.name}: <span className="font-semibold text-slate-700">{s.value}</span></span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Class-wise Attendance */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <h3 className="text-[14px] font-semibold text-slate-700">Class-wise Attendance Rates</h3>
        </div>
        <div className="p-5">
          {classAttendance.length > 0 ? (
            <div className="space-y-3">
              {classAttendance.map((c: { classId: string; className: string; rate: number; total: number }) => (
                <div key={c.classId} className="flex items-center gap-4">
                  <span className="text-sm font-medium text-slate-600 w-28 truncate">{c.className}</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${c.rate >= 85 ? 'bg-emerald-500' : c.rate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${c.rate}%` }} />
                  </div>
                  <span className={`text-sm font-semibold tabular-nums w-14 text-right ${c.rate >= 85 ? 'text-emerald-600' : c.rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{c.rate}%</span>
                  <span className="text-xs text-slate-400 tabular-nums w-16 text-right">{c.total} records</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No attendance data available</p>
          )}
        </div>
      </div>

      {/* Daily Breakdown - Stacked */}
      <ChartCard title="Daily Attendance Breakdown" icon={Activity} color="emerald" loading={false}
        headerRight={
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Present</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Absent</span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Late</span>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} interval={range === '30d' ? 4 : 0} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="present" name="Present" stackId="a" fill="#10b981" barSize={range === '7d' ? 32 : 12} />
            <Bar dataKey="absent" name="Absent" stackId="a" fill="#f87171" />
            <Bar dataKey="late" name="Late" stackId="a" fill="#fbbf24" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

/* ==================================================================
   FINANCIAL TAB
   ================================================================== */

interface FinancialTabProps {
  fees: Fee[];
  monthlyFees: MonthlyFeeData[];
  feeDefaulters: FeeDefaulter[];
  feeTypeBreakdown: { type: string; total: number; collected: number; pending: number; percentage: number }[];
  feeForecast: { projected: number; confidence: number };
  collectedFees: number;
  totalFeeAmount: number;
  classMap: Record<string, string>;
}

function FinancialTab({
  fees, monthlyFees, feeDefaulters, feeTypeBreakdown,
  feeForecast, collectedFees, totalFeeAmount, classMap,
}: FinancialTabProps) {
  const collectionRate = totalFeeAmount > 0 ? Math.round((collectedFees / totalFeeAmount) * 100) : 0;
  const overdueFees = fees.filter((f: Fee) => f.status === 'Overdue').reduce((s: number, f: Fee) => s + f.amount - (f.amountPaid || 0), 0);

  const feeStatusData = useMemo(() => [
    { name: 'Paid', value: fees.filter((f: Fee) => f.status === 'Paid').length, color: '#10b981' },
    { name: 'Pending', value: fees.filter((f: Fee) => f.status === 'Pending').length, color: '#f59e0b' },
    { name: 'Overdue', value: fees.filter((f: Fee) => f.status === 'Overdue').length, color: '#ef4444' },
    { name: 'Partial', value: fees.filter((f: Fee) => f.status === 'Partial').length, color: '#3b82f6' },
  ], [fees]);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard icon={IndianRupee} title="Collected" value={formatCurrency(collectedFees)} subtitle={`${collectionRate}% collection rate`} color="emerald" />
        <InsightCard icon={Clock} title="Pending" value={formatCurrency(totalFeeAmount - collectedFees)} subtitle="Outstanding amount" color="amber" />
        <InsightCard icon={AlertTriangle} title="Overdue" value={formatCurrency(overdueFees)} subtitle={`${fees.filter((f: Fee) => f.status === 'Overdue').length} records`} color="rose" />
        <InsightCard icon={Zap} title="Forecast" value={formatCurrency(feeForecast.projected)} subtitle={`${feeForecast.confidence}% confidence`} color="violet" trend="up" />
      </div>

      {/* Collection Forecast Banner */}
      <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl border border-slate-200 p-5" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-800">Collection Forecast</h3>
          <span className="text-[10px] font-medium text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full uppercase tracking-wide">Projected</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white/80 rounded-lg border border-white p-4">
            <p className="text-xs text-slate-500 mb-1">Total Billed</p>
            <p className="text-lg font-semibold text-slate-900">{formatCurrency(totalFeeAmount)}</p>
          </div>
          <div className="bg-white/80 rounded-lg border border-white p-4">
            <p className="text-xs text-slate-500 mb-1">Currently Collected</p>
            <p className="text-lg font-semibold text-emerald-600">{formatCurrency(collectedFees)}</p>
          </div>
          <div className="bg-white/80 rounded-lg border border-white p-4">
            <p className="text-xs text-slate-500 mb-1">Projected Total</p>
            <p className="text-lg font-semibold text-blue-600">{formatCurrency(feeForecast.projected)}</p>
          </div>
          <div className="bg-white/80 rounded-lg border border-white p-4">
            <p className="text-xs text-slate-500 mb-1">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${feeForecast.confidence}%` }} />
              </div>
              <span className="text-sm font-semibold text-violet-600">{feeForecast.confidence}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard title="Monthly Collection Trend" icon={BarChart3} color="emerald" loading={false}
            headerRight={
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Collected</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Pending</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Overdue</span>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyFees}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="monthLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `Rs.${Math.round(v / 1000)}K`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[4, 4, 0, 0]} barSize={18} />
                <Bar dataKey="overdue" name="Overdue" fill="#f87171" radius={[4, 4, 0, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Fee Status" icon={PieChart} color="amber" loading={false}>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <RechartsPie>
                <Pie data={feeStatusData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                  {feeStatusData.map((entry: { name: string; value: number; color: string }, i: number) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </RechartsPie>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {feeStatusData.map((s: { name: string; value: number; color: string }) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-500">{s.name}: <span className="font-semibold text-slate-700">{s.value}</span></span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Fee Type Breakdown + Collection Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Revenue by Fee Type" icon={BarChart3} color="blue" loading={false}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={feeTypeBreakdown.slice(0, 6)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `Rs.${Math.round(v / 1000)}K`} />
              <YAxis dataKey="type" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} width={80} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} stackId="a" />
              <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={16} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Monthly Collection Rate %" icon={TrendingUp} color="emerald" loading={false}>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyFees}>
              <defs>
                <linearGradient id="colRateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="monthLabel" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="collectionRate" name="Collection Rate" stroke="#10b981" strokeWidth={2.5} fill="url(#colRateGrad)" dot={{ fill: '#10b981', r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Fee Defaulters */}
      {feeDefaulters.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-red-50">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-[14px] font-semibold text-slate-700">Fee Defaulters</h3>
            <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full ml-auto">{feeDefaulters.length} students</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Student</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Class</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Total Due</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Paid</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Outstanding</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Overdue</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-2.5">Pending</th>
                </tr>
              </thead>
              <tbody>
                {feeDefaulters.slice(0, 10).map((d: FeeDefaulter) => (
                  <tr key={d.studentId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-slate-700">{d.studentName}</td>
                    <td className="px-5 py-3 text-sm text-slate-500">{classMap[d.classId] || d.classId}-{d.sectionId}</td>
                    <td className="px-5 py-3 text-sm text-right font-medium text-slate-700 tabular-nums">{formatCurrency(d.totalDue)}</td>
                    <td className="px-5 py-3 text-sm text-right text-emerald-600 font-medium tabular-nums">{formatCurrency(d.totalPaid)}</td>
                    <td className="px-5 py-3 text-sm text-right text-red-600 font-semibold tabular-nums">{formatCurrency(d.totalDue - d.totalPaid)}</td>
                    <td className="px-5 py-3 text-center">
                      {d.overdueCount > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600">{d.overdueCount}</span>}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {d.pendingCount > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{d.pendingCount}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

