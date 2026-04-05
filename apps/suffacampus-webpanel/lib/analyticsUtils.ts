// ── Analytics Utilities ───────────────────────────────────────────────
// Computation helpers for deriving insights from school data.
// All functions are pure, stateless, and operate on typed domain arrays.

import { Student, Teacher, Fee, Attendance, Result, Class, Event } from '@/types';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval, subMonths, differenceInDays } from 'date-fns';

// ── Types ────────────────────────────────────────────────────────────

export interface GradeDistribution {
  grade: string;
  count: number;
  percentage: number;
  color: string;
}

export interface ClassPerformance {
  classId: string;
  className: string;
  avgPercentage: number;
  passRate: number;
  studentCount: number;
  topScore: number;
  lowestScore: number;
}

export interface AttendanceTrend {
  date: string;
  label: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

export interface MonthlyFeeData {
  month: string;
  monthLabel: string;
  collected: number;
  pending: number;
  overdue: number;
  total: number;
  collectionRate: number;
}

export interface SubjectPerformance {
  subject: string;
  avgPercentage: number;
  passRate: number;
  resultCount: number;
  highestScore: number;
  lowestScore: number;
}

export interface StudentRanking {
  studentId: string;
  studentName: string;
  classId: string;
  sectionId: string;
  avgPercentage: number;
  totalExams: number;
  passRate: number;
}

export interface AtRiskStudent {
  studentId: string;
  studentName: string;
  classId: string;
  sectionId: string;
  attendanceRate: number;
  avgPercentage: number;
  riskFactors: string[];
  riskLevel: 'high' | 'medium' | 'low';
}

export interface FeeDefaulter {
  studentId: string;
  studentName: string;
  classId: string;
  sectionId: string;
  totalDue: number;
  totalPaid: number;
  overdueCount: number;
  pendingCount: number;
}

export interface DayAttendanceHeatmap {
  day: string;     // Mon, Tue, ...
  week: number;
  rate: number;
  date: string;
}

// ── Grade Distribution ───────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  'A+': '#059669', 'A': '#10b981', 'B+': '#3b82f6', 'B': '#60a5fa',
  'C+': '#f59e0b', 'C': '#fbbf24', 'D': '#f97316', 'F': '#ef4444',
};

const GRADE_ORDER = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];

export function computeGradeDistribution(results: Result[]): GradeDistribution[] {
  const map: Record<string, number> = {};
  results.forEach((r) => {
    const g = r.grade || 'N/A';
    map[g] = (map[g] || 0) + 1;
  });
  const total = results.length || 1;
  return GRADE_ORDER
    .filter((g) => map[g])
    .map((grade) => ({
      grade,
      count: map[grade],
      percentage: Math.round((map[grade] / total) * 100),
      color: GRADE_COLORS[grade] || '#94a3b8',
    }));
}

// ── Class-wise Performance ───────────────────────────────────────────

export function computeClassPerformance(results: Result[], classes: Class[]): ClassPerformance[] {
  const grouped: Record<string, Result[]> = {};
  results.forEach((r) => {
    const key = r.classId || 'Unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  return Object.entries(grouped)
    .map(([classId, recs]) => {
      const cls = classes.find((c) => c.id === classId);
      const avg = recs.reduce((s, r) => s + (r.percentage || 0), 0) / (recs.length || 1);
      const passed = recs.filter((r) => r.status === 'Pass').length;
      const scores = recs.map((r) => r.percentage || 0);
      return {
        classId,
        className: cls?.className || classId.replace('class-', 'Class '),
        avgPercentage: Math.round(avg),
        passRate: Math.round((passed / (recs.length || 1)) * 100),
        studentCount: new Set(recs.map((r) => r.studentId)).size,
        topScore: Math.max(...scores, 0),
        lowestScore: Math.min(...scores, 0),
      };
    })
    .sort((a, b) => b.avgPercentage - a.avgPercentage);
}

// ── Subject Performance ──────────────────────────────────────────────

export function computeSubjectPerformance(results: Result[]): SubjectPerformance[] {
  const grouped: Record<string, Result[]> = {};
  results.forEach((r) => {
    const sub = r.subject || 'Unknown';
    if (!grouped[sub]) grouped[sub] = [];
    grouped[sub].push(r);
  });

  return Object.entries(grouped)
    .map(([subject, recs]) => {
      const avg = recs.reduce((s, r) => s + (r.percentage || 0), 0) / (recs.length || 1);
      const passed = recs.filter((r) => r.status === 'Pass').length;
      const scores = recs.map((r) => r.percentage || 0);
      return {
        subject,
        avgPercentage: Math.round(avg),
        passRate: Math.round((passed / (recs.length || 1)) * 100),
        resultCount: recs.length,
        highestScore: Math.max(...scores, 0),
        lowestScore: Math.min(...scores, 0),
      };
    })
    .sort((a, b) => b.avgPercentage - a.avgPercentage);
}

// ── Student Rankings ─────────────────────────────────────────────────

export function computeStudentRankings(results: Result[]): { top: StudentRanking[]; bottom: StudentRanking[] } {
  const grouped: Record<string, Result[]> = {};
  results.forEach((r) => {
    const key = r.studentId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  const rankings: StudentRanking[] = Object.entries(grouped)
    .map(([studentId, recs]) => {
      const avg = recs.reduce((s, r) => s + (r.percentage || 0), 0) / (recs.length || 1);
      const passed = recs.filter((r) => r.status === 'Pass').length;
      return {
        studentId,
        studentName: recs[0]?.studentName || studentId,
        classId: recs[0]?.classId || '',
        sectionId: recs[0]?.sectionId || '',
        avgPercentage: Math.round(avg * 10) / 10,
        totalExams: recs.length,
        passRate: Math.round((passed / (recs.length || 1)) * 100),
      };
    })
    .sort((a, b) => b.avgPercentage - a.avgPercentage);

  return {
    top: rankings.slice(0, 10),
    bottom: rankings.slice(-10).reverse(),
  };
}

// ── Attendance Trends ────────────────────────────────────────────────

export function computeAttendanceTrends(attendance: Attendance[], days: number = 30): AttendanceTrend[] {
  const now = new Date();
  const trends: AttendanceTrend[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(now, i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const label = days <= 7 ? format(d, 'EEE') : format(d, 'dd MMM');

    const dayRecords = attendance.filter((a) => {
      try { return format(new Date(a.date), 'yyyy-MM-dd') === dateStr; } catch { return false; }
    });

    const present = dayRecords.filter((a) => a.status === 'Present').length;
    const absent = dayRecords.filter((a) => a.status === 'Absent').length;
    const late = dayRecords.filter((a) => a.status === 'Late').length;
    const excused = dayRecords.filter((a) => a.status === 'Excused').length;
    const total = dayRecords.length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    trends.push({ date: dateStr, label, present, absent, late, excused, total, rate });
  }

  return trends;
}

// ── Class-wise Attendance ────────────────────────────────────────────

export function computeClassAttendanceRates(attendance: Attendance[], classes: Class[]): { classId: string; className: string; rate: number; total: number }[] {
  const grouped: Record<string, Attendance[]> = {};
  attendance.forEach((a) => {
    const key = a.classId || 'Unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  return Object.entries(grouped)
    .map(([classId, recs]) => {
      const cls = classes.find((c) => c.id === classId);
      const present = recs.filter((a) => a.status === 'Present' || a.status === 'Late').length;
      return {
        classId,
        className: cls?.className || classId.replace('class-', 'Class '),
        rate: Math.round((present / (recs.length || 1)) * 100),
        total: recs.length,
      };
    })
    .sort((a, b) => b.rate - a.rate);
}

// ── Monthly Fee Analytics ────────────────────────────────────────────

export function computeMonthlyFees(fees: Fee[], months: number = 6): MonthlyFeeData[] {
  const now = new Date();
  const result: MonthlyFeeData[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const monthStr = format(monthDate, 'yyyy-MM');
    const monthLabel = format(monthDate, 'MMM yyyy');

    const monthFees = fees.filter((f) => {
      try { return format(new Date(f.createdAt), 'yyyy-MM') === monthStr; } catch { return false; }
    });

    const collected = monthFees.filter((f) => f.status === 'Paid').reduce((s, f) => s + f.amount, 0)
      + monthFees.filter((f) => f.status === 'Partial').reduce((s, f) => s + (f.amountPaid || 0), 0);
    const pending = monthFees.filter((f) => f.status === 'Pending').reduce((s, f) => s + f.amount - (f.amountPaid || 0), 0);
    const overdue = monthFees.filter((f) => f.status === 'Overdue').reduce((s, f) => s + f.amount - (f.amountPaid || 0), 0);
    const total = collected + pending + overdue;
    const collectionRate = total > 0 ? Math.round((collected / total) * 100) : 0;

    result.push({ month: monthStr, monthLabel, collected, pending, overdue, total, collectionRate });
  }

  return result;
}

// ── Fee Defaulters ───────────────────────────────────────────────────

export function computeFeeDefaulters(fees: Fee[]): FeeDefaulter[] {
  const grouped: Record<string, Fee[]> = {};
  fees.forEach((f) => {
    if (f.status === 'Pending' || f.status === 'Overdue' || f.status === 'Partial') {
      const key = f.studentId;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(f);
    }
  });

  return Object.entries(grouped)
    .map(([studentId, recs]) => {
      const totalDue = recs.reduce((s, f) => s + f.amount, 0);
      const totalPaid = recs.reduce((s, f) => s + (f.amountPaid || 0), 0);
      return {
        studentId,
        studentName: recs[0]?.studentName || studentId,
        classId: recs[0]?.classId || '',
        sectionId: recs[0]?.sectionId || '',
        totalDue,
        totalPaid,
        overdueCount: recs.filter((f) => f.status === 'Overdue').length,
        pendingCount: recs.filter((f) => f.status === 'Pending').length,
      };
    })
    .sort((a, b) => (b.totalDue - b.totalPaid) - (a.totalDue - a.totalPaid))
    .slice(0, 15);
}

// ── Fee Type Breakdown ───────────────────────────────────────────────

export function computeFeeTypeBreakdown(fees: Fee[]): { type: string; total: number; collected: number; pending: number; percentage: number }[] {
  const grouped: Record<string, Fee[]> = {};
  fees.forEach((f) => {
    const key = f.feeType || 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  });

  const grandTotal = fees.reduce((s, f) => s + f.amount, 0) || 1;

  return Object.entries(grouped)
    .map(([type, recs]) => {
      const total = recs.reduce((s, f) => s + f.amount, 0);
      const collected = recs.filter((f) => f.status === 'Paid').reduce((s, f) => s + f.amount, 0)
        + recs.filter((f) => f.status === 'Partial').reduce((s, f) => s + (f.amountPaid || 0), 0);
      return {
        type,
        total,
        collected,
        pending: total - collected,
        percentage: Math.round((total / grandTotal) * 100),
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ── At-Risk Students ─────────────────────────────────────────────────

export function computeAtRiskStudents(
  students: Student[],
  attendance: Attendance[],
  results: Result[],
): AtRiskStudent[] {
  const attendanceMap: Record<string, { total: number; present: number }> = {};
  attendance.forEach((a) => {
    if (!attendanceMap[a.studentId]) attendanceMap[a.studentId] = { total: 0, present: 0 };
    attendanceMap[a.studentId].total++;
    if (a.status === 'Present' || a.status === 'Late') attendanceMap[a.studentId].present++;
  });

  const resultMap: Record<string, Result[]> = {};
  results.forEach((r) => {
    if (!resultMap[r.studentId]) resultMap[r.studentId] = [];
    resultMap[r.studentId].push(r);
  });

  const atRisk: AtRiskStudent[] = [];

  students.filter((s) => s.isActive).forEach((s) => {
    const att = attendanceMap[s.id] || { total: 0, present: 0 };
    const attRate = att.total > 0 ? Math.round((att.present / att.total) * 100) : 100;

    const studentResults = resultMap[s.id] || [];
    const avgPct = studentResults.length > 0
      ? Math.round(studentResults.reduce((sum, r) => sum + (r.percentage || 0), 0) / studentResults.length)
      : -1;

    const factors: string[] = [];
    if (attRate < 75) factors.push('Low attendance');
    if (attRate < 50) factors.push('Critical attendance');
    if (avgPct >= 0 && avgPct < 40) factors.push('Failing grades');
    if (avgPct >= 0 && avgPct < 60) factors.push('Below average grades');
    const failCount = studentResults.filter((r) => r.status === 'Fail').length;
    if (failCount >= 2) factors.push(`Failed ${failCount} exams`);

    if (factors.length > 0) {
      const riskLevel: 'high' | 'medium' | 'low' =
        factors.length >= 3 || attRate < 50 || avgPct < 35 ? 'high'
        : factors.length >= 2 || attRate < 65 || avgPct < 50 ? 'medium'
        : 'low';

      atRisk.push({
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        classId: s.classId,
        sectionId: s.sectionId,
        attendanceRate: attRate,
        avgPercentage: avgPct >= 0 ? avgPct : -1,
        riskFactors: factors,
        riskLevel,
      });
    }
  });

  return atRisk.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.riskLevel] - order[b.riskLevel];
  });
}

// ── Fee Collection Forecast ──────────────────────────────────────────

export function computeFeeCollectionForecast(fees: Fee[]): { projected: number; confidence: number } {
  const totalAmount = fees.reduce((s, f) => s + f.amount, 0);
  const collected = fees.filter((f) => f.status === 'Paid').reduce((s, f) => s + f.amount, 0)
    + fees.filter((f) => f.status === 'Partial').reduce((s, f) => s + (f.amountPaid || 0), 0);
  const currentRate = totalAmount > 0 ? collected / totalAmount : 0;

  // Simple forecast: extrapolate current collection rate with a slight optimism factor
  const projected = Math.round(totalAmount * Math.min(currentRate * 1.05, 1));
  const confidence = Math.round(Math.min(currentRate * 100 + 5, 95));

  return { projected, confidence };
}

// ── Attendance Prediction ────────────────────────────────────────────

export function computeAttendancePrediction(attendance: Attendance[]): { predictedRate: number; trend: 'improving' | 'declining' | 'stable' } {
  if (attendance.length === 0) return { predictedRate: 0, trend: 'stable' };

  const now = new Date();
  const recent = attendance.filter((a) => {
    try { return differenceInDays(now, new Date(a.date)) <= 7; } catch { return false; }
  });
  const older = attendance.filter((a) => {
    try {
      const d = differenceInDays(now, new Date(a.date));
      return d > 7 && d <= 14;
    } catch { return false; }
  });

  const recentRate = recent.length > 0
    ? (recent.filter((a) => a.status === 'Present' || a.status === 'Late').length / recent.length) * 100
    : 0;
  const olderRate = older.length > 0
    ? (older.filter((a) => a.status === 'Present' || a.status === 'Late').length / older.length) * 100
    : recentRate;

  const diff = recentRate - olderRate;
  const trend: 'improving' | 'declining' | 'stable' = diff > 2 ? 'improving' : diff < -2 ? 'declining' : 'stable';
  const predictedRate = Math.round(Math.min(Math.max(recentRate + diff * 0.5, 0), 100));

  return { predictedRate, trend };
}

// ── Exam-wise Score Distribution ─────────────────────────────────────

export function computeExamScoreDistribution(results: Result[]): { range: string; count: number; color: string }[] {
  const ranges = [
    { min: 90, max: 100, label: '90-100', color: '#059669' },
    { min: 80, max: 89,  label: '80-89',  color: '#10b981' },
    { min: 70, max: 79,  label: '70-79',  color: '#3b82f6' },
    { min: 60, max: 69,  label: '60-69',  color: '#60a5fa' },
    { min: 50, max: 59,  label: '50-59',  color: '#f59e0b' },
    { min: 40, max: 49,  label: '40-49',  color: '#f97316' },
    { min: 0,  max: 39,  label: '0-39',   color: '#ef4444' },
  ];

  return ranges.map(({ min, max, label, color }) => ({
    range: label,
    count: results.filter((r) => (r.percentage || 0) >= min && (r.percentage || 0) <= max).length,
    color,
  }));
}
