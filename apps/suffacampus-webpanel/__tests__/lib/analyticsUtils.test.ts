/**
 * Unit tests for lib/analyticsUtils.ts
 * Covers all 13 exported compute functions with mock data fixtures.
 */

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
} from '@/lib/analyticsUtils';

import type { Result, Class, Student, Attendance, Fee } from '@/types';
import { subDays, subMonths, format } from 'date-fns';

// ── Mock-data factories ──────────────────────────────────────────────

const now = new Date('2025-06-15T12:00:00Z');

function makeResult(overrides: Partial<Result> = {}): Result {
  return {
    id: 'r1',
    studentId: 's1',
    studentName: 'Alice Smith',
    rollNumber: '001',
    classId: 'c1',
    sectionId: 'sec-a',
    examType: 'Final',
    examName: 'Final 2025',
    subject: 'Math',
    marksObtained: 85,
    totalMarks: 100,
    percentage: 85,
    grade: 'A',
    status: 'Pass',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'c1',
    className: 'Class 10',
    grade: 10,
    sections: [{ id: 'sec-a', sectionName: 'A', capacity: 40, studentsCount: 30 }],
    capacity: 40,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    schoolId: 'school1',
    studentId: 'STU001',
    firstName: 'Alice',
    lastName: 'Smith',
    parentPhone: '1234567890',
    classId: 'c1',
    sectionId: 'sec-a',
    rollNumber: '001',
    dateOfBirth: new Date('2010-01-01'),
    gender: 'Female',
    address: '123 Main St',
    enrollmentDate: new Date('2024-01-01'),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'a1',
    studentId: 's1',
    studentName: 'Alice Smith',
    classId: 'c1',
    sectionId: 'sec-a',
    date: now,
    status: 'Present',
    markedBy: 'teacher1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeFee(overrides: Partial<Fee> = {}): Fee {
  return {
    id: 'f1',
    studentId: 's1',
    studentName: 'Alice Smith',
    classId: 'c1',
    sectionId: 'sec-a',
    amount: 5000,
    dueDate: now,
    status: 'Paid',
    feeType: 'Tuition',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════

// ── computeGradeDistribution ─────────────────────────────────────────

describe('computeGradeDistribution', () => {
  it('returns empty array for no results', () => {
    expect(computeGradeDistribution([])).toEqual([]);
  });

  it('counts grades and calculates percentages', () => {
    const results = [
      makeResult({ grade: 'A', id: 'r1' }),
      makeResult({ grade: 'A', id: 'r2' }),
      makeResult({ grade: 'B', id: 'r3' }),
      makeResult({ grade: 'F', id: 'r4' }),
    ];
    const dist = computeGradeDistribution(results);

    expect(dist).toHaveLength(3); // A, B, F
    expect(dist[0]).toMatchObject({ grade: 'A', count: 2, percentage: 50 });
    expect(dist[1]).toMatchObject({ grade: 'B', count: 1, percentage: 25 });
    expect(dist[2]).toMatchObject({ grade: 'F', count: 1, percentage: 25 });
  });

  it('follows GRADE_ORDER sort', () => {
    const results = [
      makeResult({ grade: 'F', id: 'r1' }),
      makeResult({ grade: 'A+', id: 'r2' }),
      makeResult({ grade: 'C', id: 'r3' }),
    ];
    const dist = computeGradeDistribution(results);
    expect(dist.map((d) => d.grade)).toEqual(['A+', 'C', 'F']);
  });

  it('assigns correct colors', () => {
    const results = [makeResult({ grade: 'A+' }), makeResult({ grade: 'F', id: 'r2' })];
    const dist = computeGradeDistribution(results);
    expect(dist[0].color).toBe('#059669'); // A+
    expect(dist[1].color).toBe('#ef4444'); // F
  });
});

// ── computeClassPerformance ──────────────────────────────────────────

describe('computeClassPerformance', () => {
  it('returns empty array for no results', () => {
    expect(computeClassPerformance([], [makeClass()])).toEqual([]);
  });

  it('computes correct metrics per class', () => {
    const results = [
      makeResult({ classId: 'c1', percentage: 90, status: 'Pass', studentId: 's1', id: 'r1' }),
      makeResult({ classId: 'c1', percentage: 60, status: 'Pass', studentId: 's2', id: 'r2' }),
      makeResult({ classId: 'c1', percentage: 30, status: 'Fail', studentId: 's3', id: 'r3' }),
    ];
    const classes = [makeClass({ id: 'c1', className: 'Class 10' })];
    const perf = computeClassPerformance(results, classes);

    expect(perf).toHaveLength(1);
    expect(perf[0].className).toBe('Class 10');
    expect(perf[0].avgPercentage).toBe(60); // (90+60+30)/3 = 60
    expect(perf[0].passRate).toBe(67); // 2/3 ≈ 67%
    expect(perf[0].studentCount).toBe(3);
    expect(perf[0].topScore).toBe(90);
    // Math.min(...scores, 0) uses 0 as sentinel → min(90,60,30,0) = 0
    expect(perf[0].lowestScore).toBe(0);
  });

  it('sorts by avgPercentage descending', () => {
    const results = [
      makeResult({ classId: 'c1', percentage: 40, id: 'r1' }),
      makeResult({ classId: 'c2', percentage: 80, id: 'r2' }),
    ];
    const classes = [
      makeClass({ id: 'c1', className: 'Class 5' }),
      makeClass({ id: 'c2', className: 'Class 8' }),
    ];
    const perf = computeClassPerformance(results, classes);
    expect(perf[0].classId).toBe('c2');
    expect(perf[1].classId).toBe('c1');
  });

  it('falls back to classId when class not found', () => {
    const results = [makeResult({ classId: 'class-99' })];
    const perf = computeClassPerformance(results, []);
    expect(perf[0].className).toBe('Class 99'); // classId.replace('class-', 'Class ')
  });
});

// ── computeSubjectPerformance ────────────────────────────────────────

describe('computeSubjectPerformance', () => {
  it('returns empty for no results', () => {
    expect(computeSubjectPerformance([])).toEqual([]);
  });

  it('groups by subject and computes metrics', () => {
    const results = [
      makeResult({ subject: 'Math', percentage: 90, status: 'Pass', id: 'r1' }),
      makeResult({ subject: 'Math', percentage: 70, status: 'Pass', id: 'r2' }),
      makeResult({ subject: 'English', percentage: 50, status: 'Pass', id: 'r3' }),
      makeResult({ subject: 'English', percentage: 30, status: 'Fail', id: 'r4' }),
    ];
    const perf = computeSubjectPerformance(results);

    expect(perf).toHaveLength(2);
    // Sorted by avg desc → Math first (avg 80), then English (avg 40)
    expect(perf[0].subject).toBe('Math');
    expect(perf[0].avgPercentage).toBe(80);
    expect(perf[0].passRate).toBe(100);
    expect(perf[0].highestScore).toBe(90);
    // Math.min(...scores, 0) uses 0 as sentinel → min(90,70,0) = 0
    expect(perf[0].lowestScore).toBe(0);

    expect(perf[1].subject).toBe('English');
    expect(perf[1].avgPercentage).toBe(40);
    expect(perf[1].passRate).toBe(50); // 1/2
  });
});

// ── computeStudentRankings ───────────────────────────────────────────

describe('computeStudentRankings', () => {
  it('returns empty top/bottom for no results', () => {
    const { top, bottom } = computeStudentRankings([]);
    expect(top).toEqual([]);
    expect(bottom).toEqual([]);
  });

  it('ranks students by avgPercentage', () => {
    const results = [
      makeResult({ studentId: 's1', studentName: 'Alice', percentage: 90, status: 'Pass', id: 'r1' }),
      makeResult({ studentId: 's1', studentName: 'Alice', percentage: 80, status: 'Pass', id: 'r2' }),
      makeResult({ studentId: 's2', studentName: 'Bob', percentage: 50, status: 'Pass', id: 'r3' }),
      makeResult({ studentId: 's3', studentName: 'Charlie', percentage: 30, status: 'Fail', id: 'r4' }),
    ];
    const { top, bottom } = computeStudentRankings(results);

    expect(top[0].studentName).toBe('Alice');
    expect(top[0].avgPercentage).toBe(85); // (90+80)/2
    expect(top[0].totalExams).toBe(2);
    expect(top[0].passRate).toBe(100);

    expect(top[1].studentName).toBe('Bob');
    expect(top[2].studentName).toBe('Charlie');
    expect(top[2].passRate).toBe(0);
  });

  it('limits top to 10 and bottom to 10', () => {
    const results: Result[] = [];
    for (let i = 0; i < 15; i++) {
      results.push(makeResult({ studentId: `s${i}`, studentName: `Student ${i}`, percentage: i * 5, id: `r${i}` }));
    }
    const { top, bottom } = computeStudentRankings(results);
    expect(top).toHaveLength(10);
    expect(bottom).toHaveLength(10);
  });

  it('bottom is reversed (worst first)', () => {
    const results: Result[] = [];
    for (let i = 0; i < 15; i++) {
      results.push(makeResult({ studentId: `s${i}`, percentage: i * 5 + 10, id: `r${i}` }));
    }
    const { bottom } = computeStudentRankings(results);
    expect(bottom[0].avgPercentage).toBeLessThanOrEqual(bottom[1].avgPercentage);
  });
});

// ── computeAttendanceTrends (date-relative) ──────────────────────────

describe('computeAttendanceTrends', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns correct number of days', () => {
    const trends = computeAttendanceTrends([], 7);
    expect(trends).toHaveLength(7);
  });

  it('returns 30 days by default', () => {
    const trends = computeAttendanceTrends([]);
    expect(trends).toHaveLength(30);
  });

  it('correctly counts statuses', () => {
    const today = format(now, 'yyyy-MM-dd');
    const attendance = [
      makeAttendance({ date: new Date(today), status: 'Present', id: 'a1' }),
      makeAttendance({ date: new Date(today), status: 'Present', id: 'a2' }),
      makeAttendance({ date: new Date(today), status: 'Absent', id: 'a3' }),
      makeAttendance({ date: new Date(today), status: 'Late', id: 'a4' }),
      makeAttendance({ date: new Date(today), status: 'Excused', id: 'a5' }),
    ];
    const trends = computeAttendanceTrends(attendance, 1);

    expect(trends).toHaveLength(1);
    expect(trends[0].present).toBe(2);
    expect(trends[0].absent).toBe(1);
    expect(trends[0].late).toBe(1);
    expect(trends[0].excused).toBe(1);
    expect(trends[0].total).toBe(5);
    // rate = (present + late) / total = 3/5 = 60%
    expect(trends[0].rate).toBe(60);
  });

  it('rate is 0 when no records for a day', () => {
    const trends = computeAttendanceTrends([], 3);
    trends.forEach((t) => expect(t.rate).toBe(0));
  });

  it('uses short labels for <= 7 days', () => {
    const trends = computeAttendanceTrends([], 7);
    // Labels should be like 'Mon', 'Tue', etc (3-char day names)
    trends.forEach((t) => expect(t.label.length).toBeLessThanOrEqual(3));
  });

  it('uses dd MMM labels for > 7 days', () => {
    const trends = computeAttendanceTrends([], 10);
    // Labels should be like '06 Jun' — 6 chars
    trends.forEach((t) => expect(t.label.length).toBeGreaterThan(3));
  });
});

// ── computeClassAttendanceRates ──────────────────────────────────────

describe('computeClassAttendanceRates', () => {
  it('returns empty for no attendance', () => {
    expect(computeClassAttendanceRates([], [makeClass()])).toEqual([]);
  });

  it('calculates rate with Present + Late as attended', () => {
    const attendance = [
      makeAttendance({ classId: 'c1', status: 'Present', id: 'a1' }),
      makeAttendance({ classId: 'c1', status: 'Late', id: 'a2' }),
      makeAttendance({ classId: 'c1', status: 'Absent', id: 'a3' }),
      makeAttendance({ classId: 'c1', status: 'Absent', id: 'a4' }),
    ];
    const classes = [makeClass({ id: 'c1', className: 'Class 10' })];
    const rates = computeClassAttendanceRates(attendance, classes);

    expect(rates).toHaveLength(1);
    expect(rates[0].className).toBe('Class 10');
    expect(rates[0].rate).toBe(50); // 2/4
    expect(rates[0].total).toBe(4);
  });

  it('sorts by rate descending', () => {
    const attendance = [
      makeAttendance({ classId: 'c1', status: 'Present', id: 'a1' }),
      makeAttendance({ classId: 'c1', status: 'Absent', id: 'a2' }),
      makeAttendance({ classId: 'c2', status: 'Present', id: 'a3' }),
      makeAttendance({ classId: 'c2', status: 'Present', id: 'a4' }),
    ];
    const classes = [
      makeClass({ id: 'c1', className: 'Class 5' }),
      makeClass({ id: 'c2', className: 'Class 8' }),
    ];
    const rates = computeClassAttendanceRates(attendance, classes);
    expect(rates[0].classId).toBe('c2'); // 100%
    expect(rates[1].classId).toBe('c1'); // 50%
  });
});

// ── computeMonthlyFees (date-relative) ───────────────────────────────

describe('computeMonthlyFees', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns correct number of months', () => {
    const result = computeMonthlyFees([], 3);
    expect(result).toHaveLength(3);
  });

  it('defaults to 6 months', () => {
    const result = computeMonthlyFees([]);
    expect(result).toHaveLength(6);
  });

  it('aggregates Paid, Partial, Pending, and Overdue fees', () => {
    const currentMonth = now;
    const fees = [
      makeFee({ status: 'Paid', amount: 5000, createdAt: currentMonth, id: 'f1' }),
      makeFee({ status: 'Partial', amount: 3000, amountPaid: 1000, createdAt: currentMonth, id: 'f2' }),
      makeFee({ status: 'Pending', amount: 2000, amountPaid: 0, createdAt: currentMonth, id: 'f3' }),
      makeFee({ status: 'Overdue', amount: 4000, amountPaid: 500, createdAt: currentMonth, id: 'f4' }),
    ];
    const result = computeMonthlyFees(fees, 1);

    expect(result).toHaveLength(1);
    const m = result[0];
    // collected = Paid(5000) + Partial.amountPaid(1000) = 6000
    expect(m.collected).toBe(6000);
    // pending = Pending(2000 - 0) = 2000
    expect(m.pending).toBe(2000);
    // overdue = Overdue(4000 - 500) = 3500
    expect(m.overdue).toBe(3500);
    expect(m.total).toBe(6000 + 2000 + 3500);
  });

  it('calculates collectionRate correctly', () => {
    const fees = [
      makeFee({ status: 'Paid', amount: 10000, createdAt: now, id: 'f1' }),
      makeFee({ status: 'Pending', amount: 10000, createdAt: now, id: 'f2' }),
    ];
    const result = computeMonthlyFees(fees, 1);
    // collected = 10000, pending = 10000, total = 20000
    // collectionRate = 10000/20000 * 100 = 50
    expect(result[0].collectionRate).toBe(50);
  });

  it('has 0 collectionRate when no fees in month', () => {
    const result = computeMonthlyFees([], 1);
    expect(result[0].collectionRate).toBe(0);
  });
});

// ── computeFeeDefaulters ─────────────────────────────────────────────

describe('computeFeeDefaulters', () => {
  it('returns empty for no fees', () => {
    expect(computeFeeDefaulters([])).toEqual([]);
  });

  it('excludes Paid fees', () => {
    const fees = [makeFee({ status: 'Paid' })];
    expect(computeFeeDefaulters(fees)).toEqual([]);
  });

  it('includes Pending, Overdue, and Partial fees', () => {
    const fees = [
      makeFee({ studentId: 's1', status: 'Pending', amount: 1000, amountPaid: 0, id: 'f1' }),
      makeFee({ studentId: 's1', status: 'Overdue', amount: 2000, amountPaid: 500, id: 'f2' }),
      makeFee({ studentId: 's2', status: 'Partial', amount: 3000, amountPaid: 1000, id: 'f3' }),
    ];
    const defaulters = computeFeeDefaulters(fees);

    expect(defaulters).toHaveLength(2);
    // s1 has higher outstanding (3000 - 500 = 2500) vs s2 (3000 - 1000 = 2000)
    expect(defaulters[0].studentId).toBe('s1');
    expect(defaulters[0].totalDue).toBe(3000); // 1000 + 2000
    expect(defaulters[0].totalPaid).toBe(500);
    expect(defaulters[0].overdueCount).toBe(1);
    expect(defaulters[0].pendingCount).toBe(1);
  });

  it('caps at 15 defaulters', () => {
    const fees: Fee[] = [];
    for (let i = 0; i < 20; i++) {
      fees.push(makeFee({ studentId: `s${i}`, status: 'Pending', amount: 1000, id: `f${i}` }));
    }
    expect(computeFeeDefaulters(fees)).toHaveLength(15);
  });

  it('sorts by outstanding amount descending', () => {
    const fees = [
      makeFee({ studentId: 's1', status: 'Pending', amount: 1000, amountPaid: 0, id: 'f1' }),
      makeFee({ studentId: 's2', status: 'Pending', amount: 5000, amountPaid: 0, id: 'f2' }),
    ];
    const defaulters = computeFeeDefaulters(fees);
    expect(defaulters[0].studentId).toBe('s2'); // 5000 > 1000
  });
});

// ── computeFeeTypeBreakdown ──────────────────────────────────────────

describe('computeFeeTypeBreakdown', () => {
  it('returns empty for no fees', () => {
    expect(computeFeeTypeBreakdown([])).toEqual([]);
  });

  it('groups fees by type', () => {
    const fees = [
      makeFee({ feeType: 'Tuition', amount: 5000, status: 'Paid', id: 'f1' }),
      makeFee({ feeType: 'Tuition', amount: 3000, status: 'Pending', id: 'f2' }),
      makeFee({ feeType: 'Transport', amount: 2000, status: 'Paid', id: 'f3' }),
    ];
    const breakdown = computeFeeTypeBreakdown(fees);

    expect(breakdown).toHaveLength(2);
    // Sorted by total desc → Tuition (8000) first
    expect(breakdown[0].type).toBe('Tuition');
    expect(breakdown[0].total).toBe(8000);
    expect(breakdown[0].collected).toBe(5000); // only Paid amount
    expect(breakdown[0].pending).toBe(3000);

    expect(breakdown[1].type).toBe('Transport');
    expect(breakdown[1].total).toBe(2000);
    expect(breakdown[1].collected).toBe(2000);
    expect(breakdown[1].pending).toBe(0);
  });

  it('calculates percentage of grand total', () => {
    const fees = [
      makeFee({ feeType: 'Tuition', amount: 7500, status: 'Paid', id: 'f1' }),
      makeFee({ feeType: 'Lab', amount: 2500, status: 'Paid', id: 'f2' }),
    ];
    const breakdown = computeFeeTypeBreakdown(fees);
    expect(breakdown[0].percentage).toBe(75); // 7500/10000
    expect(breakdown[1].percentage).toBe(25); // 2500/10000
  });

  it('includes Partial amountPaid in collected', () => {
    const fees = [
      makeFee({ feeType: 'Tuition', amount: 5000, status: 'Partial', amountPaid: 2000, id: 'f1' }),
    ];
    const breakdown = computeFeeTypeBreakdown(fees);
    expect(breakdown[0].collected).toBe(2000);
    expect(breakdown[0].pending).toBe(3000);
  });
});

// ── computeAtRiskStudents ────────────────────────────────────────────

describe('computeAtRiskStudents', () => {
  it('returns empty when no students', () => {
    expect(computeAtRiskStudents([], [], [])).toEqual([]);
  });

  it('returns empty when all students are fine', () => {
    const students = [makeStudent({ id: 's1', isActive: true })];
    const attendance = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({ studentId: 's1', status: 'Present', id: `a${i}` })
    );
    const results = [makeResult({ studentId: 's1', percentage: 80, status: 'Pass' })];

    expect(computeAtRiskStudents(students, attendance, results)).toEqual([]);
  });

  it('flags student with low attendance', () => {
    const students = [makeStudent({ id: 's1' })];
    const attendance = [
      makeAttendance({ studentId: 's1', status: 'Present', id: 'a1' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a2' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a3' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a4' }),
    ];
    const atRisk = computeAtRiskStudents(students, attendance, []);

    expect(atRisk).toHaveLength(1);
    expect(atRisk[0].attendanceRate).toBe(25); // 1/4
    expect(atRisk[0].riskFactors).toContain('Low attendance');
    expect(atRisk[0].riskFactors).toContain('Critical attendance');
  });

  it('flags student with failing grades', () => {
    const students = [makeStudent({ id: 's1' })];
    const results = [
      makeResult({ studentId: 's1', percentage: 30, status: 'Fail', id: 'r1' }),
      makeResult({ studentId: 's1', percentage: 25, status: 'Fail', id: 'r2' }),
    ];
    const atRisk = computeAtRiskStudents(students, [], results);

    expect(atRisk).toHaveLength(1);
    expect(atRisk[0].riskFactors).toContain('Failing grades');
    expect(atRisk[0].riskFactors).toContain('Failed 2 exams');
  });

  it('assigns high risk for multiple factors', () => {
    const students = [makeStudent({ id: 's1' })];
    const attendance = [
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a1' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a2' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a3' }),
      makeAttendance({ studentId: 's1', status: 'Present', id: 'a4' }),
    ];
    const results = [
      makeResult({ studentId: 's1', percentage: 20, status: 'Fail', id: 'r1' }),
      makeResult({ studentId: 's1', percentage: 15, status: 'Fail', id: 'r2' }),
    ];
    const atRisk = computeAtRiskStudents(students, attendance, results);

    expect(atRisk[0].riskLevel).toBe('high');
  });

  it('skips inactive students', () => {
    const students = [makeStudent({ id: 's1', isActive: false })];
    const attendance = [
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a1' }),
    ];
    expect(computeAtRiskStudents(students, attendance, [])).toEqual([]);
  });

  it('sorts by risk level: high → medium → low', () => {
    const students = [
      makeStudent({ id: 's1', firstName: 'High' }),
      makeStudent({ id: 's2', firstName: 'Low' }),
    ];
    // s1: critical attendance → high risk
    const attendance = [
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a1' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a2' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a3' }),
      makeAttendance({ studentId: 's1', status: 'Absent', id: 'a4' }),
    ];
    // s2: low attendance → low risk
    const attendanceS2 = [
      makeAttendance({ studentId: 's2', status: 'Present', id: 'a5' }),
      makeAttendance({ studentId: 's2', status: 'Present', id: 'a6' }),
      makeAttendance({ studentId: 's2', status: 'Absent', id: 'a7' }),
      makeAttendance({ studentId: 's2', status: 'Absent', id: 'a8' }),
    ];
    // s2: below average grades → one factor
    const results = [
      makeResult({ studentId: 's2', percentage: 55, status: 'Pass', id: 'r1' }),
    ];

    const atRisk = computeAtRiskStudents(students, [...attendance, ...attendanceS2], results);
    expect(atRisk[0].riskLevel).toBe('high');
  });
});

// ── computeFeeCollectionForecast ─────────────────────────────────────

describe('computeFeeCollectionForecast', () => {
  it('returns zero for no fees', () => {
    const result = computeFeeCollectionForecast([]);
    expect(result.projected).toBe(0);
    expect(result.confidence).toBe(5); // 0 * 100 + 5 = 5
  });

  it('projects with 1.05x optimism factor capped at 100%', () => {
    const fees = [
      makeFee({ status: 'Paid', amount: 10000, id: 'f1' }),
      makeFee({ status: 'Pending', amount: 10000, id: 'f2' }),
    ];
    const forecast = computeFeeCollectionForecast(fees);
    // currentRate = 10000/20000 = 0.5, projected = 20000 * min(0.5*1.05, 1) = 20000 * 0.525 = 10500
    expect(forecast.projected).toBe(10500);
    // confidence = min(50 + 5, 95) = 55
    expect(forecast.confidence).toBe(55);
  });

  it('caps projection rate at 100%', () => {
    const fees = [makeFee({ status: 'Paid', amount: 10000, id: 'f1' })];
    const forecast = computeFeeCollectionForecast(fees);
    // currentRate = 1.0, 1.0 * 1.05 = 1.05 → capped at 1 → projected = 10000
    expect(forecast.projected).toBe(10000);
  });

  it('caps confidence at 95', () => {
    const fees = [makeFee({ status: 'Paid', amount: 10000, id: 'f1' })];
    const forecast = computeFeeCollectionForecast(fees);
    // confidence = min(100 + 5, 95) = 95
    expect(forecast.confidence).toBe(95);
  });

  it('includes Partial amountPaid in collected', () => {
    const fees = [
      makeFee({ status: 'Partial', amount: 10000, amountPaid: 3000, id: 'f1' }),
    ];
    const forecast = computeFeeCollectionForecast(fees);
    // currentRate = 3000/10000 = 0.3, projected = 10000 * 0.3 * 1.05 = 3150
    expect(forecast.projected).toBe(3150);
  });
});

// ── computeAttendancePrediction (date-relative) ──────────────────────

describe('computeAttendancePrediction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 0 rate and stable for empty attendance', () => {
    const result = computeAttendancePrediction([]);
    expect(result.predictedRate).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('detects improving trend', () => {
    // Older week (8-14 days ago): low attendance
    const olderRecords = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({
        date: subDays(now, 10),
        status: i < 3 ? 'Present' : 'Absent', // 30% rate
        id: `old${i}`,
      })
    );
    // Recent week (0-7 days ago): high attendance
    const recentRecords = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({
        date: subDays(now, 3),
        status: i < 8 ? 'Present' : 'Absent', // 80% rate
        id: `rec${i}`,
      })
    );
    const result = computeAttendancePrediction([...olderRecords, ...recentRecords]);
    expect(result.trend).toBe('improving');
    expect(result.predictedRate).toBeGreaterThan(80); // 80 + (50 * 0.5) = 105 → capped at 100
  });

  it('detects declining trend', () => {
    const olderRecords = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({
        date: subDays(now, 10),
        status: i < 9 ? 'Present' : 'Absent', // 90% rate
        id: `old${i}`,
      })
    );
    const recentRecords = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({
        date: subDays(now, 3),
        status: i < 4 ? 'Present' : 'Absent', // 40% rate
        id: `rec${i}`,
      })
    );
    const result = computeAttendancePrediction([...olderRecords, ...recentRecords]);
    expect(result.trend).toBe('declining');
    expect(result.predictedRate).toBeLessThan(40);
  });

  it('detects stable trend', () => {
    const olderRecords = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({
        date: subDays(now, 10),
        status: i < 7 ? 'Present' : 'Absent', // 70%
        id: `old${i}`,
      })
    );
    const recentRecords = Array.from({ length: 10 }, (_, i) =>
      makeAttendance({
        date: subDays(now, 3),
        status: i < 7 ? 'Present' : 'Absent', // 70%
        id: `rec${i}`,
      })
    );
    const result = computeAttendancePrediction([...olderRecords, ...recentRecords]);
    expect(result.trend).toBe('stable');
  });

  it('clamps predictedRate between 0 and 100', () => {
    // All present recent, no older → diff = recentRate - recentRate = 0
    const recentRecords = Array.from({ length: 5 }, (_, i) =>
      makeAttendance({ date: subDays(now, 1), status: 'Present', id: `rec${i}` })
    );
    const result = computeAttendancePrediction(recentRecords);
    expect(result.predictedRate).toBeLessThanOrEqual(100);
    expect(result.predictedRate).toBeGreaterThanOrEqual(0);
  });
});

// ── computeExamScoreDistribution ─────────────────────────────────────

describe('computeExamScoreDistribution', () => {
  it('returns 7 ranges even for no results', () => {
    const dist = computeExamScoreDistribution([]);
    expect(dist).toHaveLength(7);
    dist.forEach((d) => expect(d.count).toBe(0));
  });

  it('correct range labels', () => {
    const dist = computeExamScoreDistribution([]);
    const labels = dist.map((d) => d.range);
    expect(labels).toEqual(['90-100', '80-89', '70-79', '60-69', '50-59', '40-49', '0-39']);
  });

  it('places scores in correct ranges', () => {
    const results = [
      makeResult({ percentage: 95, id: 'r1' }),  // 90-100
      makeResult({ percentage: 90, id: 'r2' }),  // 90-100
      makeResult({ percentage: 85, id: 'r3' }),  // 80-89
      makeResult({ percentage: 55, id: 'r4' }),  // 50-59
      makeResult({ percentage: 10, id: 'r5' }),  // 0-39
      makeResult({ percentage: 0, id: 'r6' }),   // 0-39
    ];
    const dist = computeExamScoreDistribution(results);

    expect(dist.find((d) => d.range === '90-100')?.count).toBe(2);
    expect(dist.find((d) => d.range === '80-89')?.count).toBe(1);
    expect(dist.find((d) => d.range === '50-59')?.count).toBe(1);
    expect(dist.find((d) => d.range === '0-39')?.count).toBe(2);
    expect(dist.find((d) => d.range === '70-79')?.count).toBe(0);
  });

  it('boundary values: 39 → 0-39, 40 → 40-49, 89 → 80-89, 100 → 90-100', () => {
    const results = [
      makeResult({ percentage: 39, id: 'r1' }),
      makeResult({ percentage: 40, id: 'r2' }),
      makeResult({ percentage: 89, id: 'r3' }),
      makeResult({ percentage: 100, id: 'r4' }),
    ];
    const dist = computeExamScoreDistribution(results);

    expect(dist.find((d) => d.range === '0-39')?.count).toBe(1);
    expect(dist.find((d) => d.range === '40-49')?.count).toBe(1);
    expect(dist.find((d) => d.range === '80-89')?.count).toBe(1);
    expect(dist.find((d) => d.range === '90-100')?.count).toBe(1);
  });

  it('has distinct colors for each range', () => {
    const dist = computeExamScoreDistribution([]);
    const colors = new Set(dist.map((d) => d.color));
    expect(colors.size).toBe(7);
  });
});
