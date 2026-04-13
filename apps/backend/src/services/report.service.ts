/**
 * Report generation service â€” creates scheduled and on-demand reports.
 * Now queries data from PostgreSQL via Prisma instead of Firestore.
 */

import { prisma } from "../lib/prisma";
import { sendEmail } from "./notification.service";
import { dateOnlyStringFrom, dateTimeFrom, moneyFrom, moneyToNumber } from "../utils/safe-fields";
import { assertSchoolScope } from "../lib/tenant-scope";

export type ReportType =
  | "attendance_weekly"
  | "attendance_monthly"
  | "fee_summary"
  | "student_performance"
  | "class_analytics";

export interface ReportConfig {
  schoolId: string;
  type: ReportType;
  startDate: string;
  endDate: string;
  filters?: Record<string, string>;
  recipientEmails?: string[];
  requestedBy: string;
}

export interface ReportResult {
  id: string;
  type: ReportType;
  html: string;
  stats: Record<string, unknown>;
  generatedAt: string;
  deliveredTo: string[];
}

export async function generateReport(config: ReportConfig): Promise<ReportResult> {
  const { schoolId, type, startDate, endDate, filters } = config;
  assertSchoolScope(schoolId);

  const startDateDt = dateTimeFrom(startDate);
  const endDateDt = dateTimeFrom(endDate);

  if (!startDateDt || !endDateDt) {
    throw new Error("Invalid startDate or endDate");
  }

  let html: string;
  let stats: Record<string, unknown>;

  switch (type) {
    case "attendance_weekly":
    case "attendance_monthly":
      ({ html, stats } = await generateAttendanceReport(schoolId, startDate, endDate, filters));
      break;
    case "fee_summary":
      ({ html, stats } = await generateFeeReport(schoolId, startDate, endDate, filters));
      break;
    case "student_performance":
      ({ html, stats } = await generatePerformanceReport(schoolId, startDate, endDate, filters));
      break;
    case "class_analytics":
      ({ html, stats } = await generateClassAnalytics(schoolId, startDate, endDate, filters));
      break;
    default:
      throw new Error(`Unknown report type: ${type}`);
  }

  // Persist report record
  const report = await prisma.report.create({
    data: {
      schoolId,
      type,
      startDate: startDateDt,
      endDate: endDateDt,
      filters: filters ? (filters as any) : undefined,
      stats: stats ? (stats as any) : undefined,
      requestedBy: config.requestedBy,
      deliveredTo: [],
      generatedAt: new Date(),
    },
  });

  const result: ReportResult = {
    id: report.id,
    type,
    html,
    stats,
    generatedAt: report.generatedAt.toISOString(),
    deliveredTo: [],
  };

  // Send via email if recipients provided
  if (config.recipientEmails && config.recipientEmails.length > 0) {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    const schoolName = school?.name ?? "SuffaCampus School";
    const reportTitle = getReportTitle(type);

    for (const email of config.recipientEmails) {
      const sent = await sendEmail({
        to: email,
        subject: `${reportTitle} â€” ${schoolName} (${startDate} to ${endDate})`,
        html: wrapInEmailTemplate(html, schoolName, reportTitle),
      });
      if (sent) result.deliveredTo.push(email);
    }

    await prisma.report.update({
      where: { id: report.id },
      data: { deliveredTo: result.deliveredTo },
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Individual report generators
// ---------------------------------------------------------------------------

async function generateAttendanceReport(
  schoolId: string,
  startDate: string,
  endDate: string,
  filters?: Record<string, string>
): Promise<{ html: string; stats: Record<string, unknown> }> {
  assertSchoolScope(schoolId);

  const startDateDt = dateTimeFrom(startDate);
  const endDateDt = dateTimeFrom(endDate);

  if (!startDateDt || !endDateDt) {
    throw new Error("Invalid attendance report date range");
  }

  const endOfDay = new Date(endDateDt);
  endOfDay.setHours(23, 59, 59, 999);

  const where: any = { schoolId, date: { gte: startDateDt, lte: endOfDay } };
  if (filters?.classId) where.classId = filters.classId;

  const records = await prisma.attendance.findMany({ where }) as any[];

  const totalRecords = records.length;
  const presentCount = records.filter((r) => r.status === "Present").length;
  const absentCount = records.filter((r) => r.status === "Absent").length;
  const lateCount = records.filter((r) => r.status === "Late").length;
  const attendanceRate = totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(1) : "0";

  const byDate = new Map<string, { present: number; absent: number; late: number; total: number }>();
  for (const r of records) {
    const dateKey = dateOnlyStringFrom(r.date);
    if (!byDate.has(dateKey)) byDate.set(dateKey, { present: 0, absent: 0, late: 0, total: 0 });
    const d = byDate.get(dateKey)!;
    d.total++;
    if (r.status === "Present") d.present++;
    else if (r.status === "Absent") d.absent++;
    else if (r.status === "Late") d.late++;
  }

  const dateRows = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) =>
      `<tr><td>${date}</td><td>${d.present}</td><td>${d.absent}</td><td>${d.late}</td><td>${d.total}</td><td>${((d.present / d.total) * 100).toFixed(1)}%</td></tr>`
    )
    .join("");

  const stats = { totalRecords, presentCount, absentCount, lateCount, attendanceRate: `${attendanceRate}%` };

  const html = `
    <div class="report-stats">
      <div class="stat-card"><div class="stat-label">Total Records</div><div class="stat-value">${totalRecords}</div></div>
      <div class="stat-card"><div class="stat-label">Present</div><div class="stat-value" style="color:#16a34a">${presentCount}</div></div>
      <div class="stat-card"><div class="stat-label">Absent</div><div class="stat-value" style="color:#dc2626">${absentCount}</div></div>
      <div class="stat-card"><div class="stat-label">Late</div><div class="stat-value" style="color:#f59e0b">${lateCount}</div></div>
      <div class="stat-card"><div class="stat-label">Rate</div><div class="stat-value" style="color:#2563eb">${attendanceRate}%</div></div>
    </div>
    <table class="report-table">
      <thead><tr><th>Date</th><th>Present</th><th>Absent</th><th>Late</th><th>Total</th><th>Rate</th></tr></thead>
      <tbody>${dateRows}</tbody>
    </table>
  `;

  return { html, stats };
}

async function generateFeeReport(
  schoolId: string, _startDate: string, _endDate: string, _filters?: Record<string, string>
): Promise<{ html: string; stats: Record<string, unknown> }> {
  assertSchoolScope(schoolId);

  const records = await prisma.fee.findMany({
    where: { schoolId },
    select: {
      status: true,
      amount: true,
      amountPaid: true,
    },
  });

  const totalFees = records.length;
  let totalAmountMoney = moneyFrom(null, 0);
  let collectedAmountMoney = moneyFrom(null, 0);
  let pendingAmountMoney = moneyFrom(null, 0);
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const record of records) {
    const totalMoney = moneyFrom(record.amount);
    totalAmountMoney = totalAmountMoney.plus(totalMoney);

    if (record.status === "Paid") {
      paidCount += 1;
      collectedAmountMoney = collectedAmountMoney.plus(totalMoney);
    } else if (record.status === "Partial") {
      collectedAmountMoney = collectedAmountMoney.plus(
        moneyFrom(record.amountPaid)
      );
    }

    if (record.status === "Pending") {
      pendingCount += 1;
      pendingAmountMoney = pendingAmountMoney.plus(totalMoney);
    }

    if (record.status === "Overdue") {
      overdueCount += 1;
      pendingAmountMoney = pendingAmountMoney.plus(totalMoney);
    }
  }

  const totalAmount = moneyToNumber(totalAmountMoney);
  const collectedAmount = moneyToNumber(collectedAmountMoney);
  const pendingAmount = moneyToNumber(pendingAmountMoney);
  const collectionRate = totalAmount > 0 ? ((collectedAmount / totalAmount) * 100).toFixed(1) : "0";

  const stats = {
    totalFees,
    totalAmount,
    collectedAmount,
    pendingAmount,
    collectionRate: `${collectionRate}%`,
    paidCount,
    pendingCount,
    overdueCount,
  };

  const html = `
    <div class="report-stats">
      <div class="stat-card"><div class="stat-label">Total Fees</div><div class="stat-value">${totalFees}</div></div>
      <div class="stat-card"><div class="stat-label">Total Amount</div><div class="stat-value">â‚¹${totalAmount.toLocaleString("en-IN")}</div></div>
      <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value" style="color:#16a34a">â‚¹${collectedAmount.toLocaleString("en-IN")}</div></div>
      <div class="stat-card"><div class="stat-label">Pending</div><div class="stat-value" style="color:#f59e0b">â‚¹${pendingAmount.toLocaleString("en-IN")}</div></div>
      <div class="stat-card"><div class="stat-label">Rate</div><div class="stat-value" style="color:#2563eb">${collectionRate}%</div></div>
    </div>
  `;

  return { html, stats };
}

async function generatePerformanceReport(
  schoolId: string, _startDate: string, _endDate: string, filters?: Record<string, string>
): Promise<{ html: string; stats: Record<string, unknown> }> {
  assertSchoolScope(schoolId);

  const where: any = { schoolId, isActive: true };
  if (filters?.classId) where.classId = filters.classId;
  if (filters?.examType) where.examType = filters.examType;

  const records = await prisma.result.findMany({ where }) as any[];

  const totalResults = records.length;
  const totalMarks = records.reduce((s, r) => s + r.marksObtained, 0);
  const totalMaxMarks = records.reduce((s, r) => s + r.totalMarks, 0);
  const avgPercentage = totalMaxMarks > 0 ? ((totalMarks / totalMaxMarks) * 100).toFixed(1) : "0";

  const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const r of records) {
    const pct = (r.marksObtained / (r.totalMarks || 1)) * 100;
    if (pct >= 90) grades.A++;
    else if (pct >= 75) grades.B++;
    else if (pct >= 60) grades.C++;
    else if (pct >= 40) grades.D++;
    else grades.F++;
  }

  const stats = { totalResults, avgPercentage: `${avgPercentage}%`, grades };
  const html = `
    <div class="report-stats">
      <div class="stat-card"><div class="stat-label">Total Results</div><div class="stat-value">${totalResults}</div></div>
      <div class="stat-card"><div class="stat-label">Avg %</div><div class="stat-value" style="color:#2563eb">${avgPercentage}%</div></div>
      <div class="stat-card"><div class="stat-label">Grade A</div><div class="stat-value" style="color:#16a34a">${grades.A}</div></div>
      <div class="stat-card"><div class="stat-label">Grade F</div><div class="stat-value" style="color:#dc2626">${grades.F}</div></div>
    </div>
  `;

  return { html, stats };
}

async function generateClassAnalytics(
  schoolId: string, _startDate: string, _endDate: string, _filters?: Record<string, string>
): Promise<{ html: string; stats: Record<string, unknown> }> {
  assertSchoolScope(schoolId);

  const [classes, studentCounts] = await Promise.all([
    prisma.class.findMany({ where: { schoolId, isActive: true }, include: { sections: true } }) as any,
    prisma.student.groupBy({ by: ["classId"], where: { schoolId, isDeleted: false }, _count: true }) as any,
  ]);

  const countMap: Record<string, number> = Object.fromEntries(studentCounts.map((c: any) => [c.classId, c._count]));
  const totalStudents = studentCounts.reduce((s: number, c: any) => s + c._count, 0);
  const totalClasses = classes.length;
  const avgClassSize = totalClasses > 0 ? Math.round(totalStudents / totalClasses) : 0;

  const classRows = classes.map((c: any) =>
    `<tr><td>${c.className}</td><td>${countMap[c.id] ?? 0}</td><td>${c.sections.length}</td></tr>`
  ).join("");

  const stats = { totalClasses, totalStudents, avgClassSize };
  const html = `
    <div class="report-stats">
      <div class="stat-card"><div class="stat-label">Classes</div><div class="stat-value">${totalClasses}</div></div>
      <div class="stat-card"><div class="stat-label">Students</div><div class="stat-value">${totalStudents}</div></div>
      <div class="stat-card"><div class="stat-label">Avg Size</div><div class="stat-value">${avgClassSize}</div></div>
    </div>
    <table class="report-table">
      <thead><tr><th>Class</th><th>Students</th><th>Sections</th></tr></thead>
      <tbody>${classRows}</tbody>
    </table>
  `;

  return { html, stats };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getReportTitle(type: ReportType): string {
  const titles: Record<ReportType, string> = {
    attendance_weekly: "Weekly Attendance Report",
    attendance_monthly: "Monthly Attendance Report",
    fee_summary: "Fee Collection Summary",
    student_performance: "Student Performance Report",
    class_analytics: "Class Analytics Report",
  };
  return titles[type] ?? "Report";
}

function wrapInEmailTemplate(bodyHtml: string, schoolName: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; opacity: 0.85; font-size: 13px; }
    .body { padding: 24px 32px; }
    .report-stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
    .stat-card { flex: 1; min-width: 110px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .stat-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
    .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .report-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .report-table th { text-align: left; padding: 10px 12px; background: #f1f5f9; font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; }
    .report-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${schoolName}</h1>
      <p>${title} &mdash; Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer"><p>Generated by SuffaCampus &bull; ${new Date().toISOString()}</p></div>
  </div>
</body>
</html>`;
}

