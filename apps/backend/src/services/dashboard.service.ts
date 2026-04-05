import { prisma } from "../lib/prisma";
import { recordDashboardQuery } from "../plugins/metrics";

/**
 * Dashboard statistics for a school — uses Prisma count/aggregate queries.
 */
export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalEvents: number;
  totalBooks: number;
  totalFees: number;
  collectedFees: number;
  pendingFees: number;
  attendanceRate?: number;
}

export async function getDashboardStats(schoolId: string): Promise<DashboardStats> {
  const started = process.hrtime.bigint();
  let ok = false;
  try {
    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      totalEvents,
      totalBooks,
      feeStats,
    ] = await Promise.all([
      prisma.student.count({ where: { schoolId, isDeleted: false } }),
      prisma.teacher.count({ where: { schoolId, isDeleted: false } }),
      prisma.class.count({ where: { schoolId, isActive: true } }),
      prisma.event.count({ where: { schoolId, isActive: true } }),
      prisma.book.count({ where: { schoolId, isActive: true } }),
      prisma.fee.aggregate({
        where: { schoolId },
        _sum: { amount: true, amountPaid: true },
      }),
    ]);

    const totalFees = feeStats._sum.amount ?? 0;
    const collectedFees = feeStats._sum.amountPaid ?? 0;

    const payload = {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalEvents,
      totalBooks,
      totalFees,
      collectedFees,
      pendingFees: totalFees - collectedFees,
    };
    ok = true;
    return payload;
  } finally {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    recordDashboardQuery("stats", durationMs, ok);
  }
}

/**
 * Recent activity feed — last N audit log entries for a school.
 */
export async function getRecentActivity(schoolId: string, limit = 20) {
  const started = process.hrtime.bigint();
  let ok = false;
  try {
    const data = await prisma.auditLog.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    ok = true;
    return data;
  } finally {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    recordDashboardQuery("activity", durationMs, ok);
  }
}

/**
 * Upcoming events for a school (next 30 days).
 */
export async function getUpcomingEvents(schoolId: string, limit = 5) {
  const today = new Date().toISOString().split("T")[0];
  const started = process.hrtime.bigint();
  let ok = false;
  try {
    const data = await prisma.event.findMany({
      where: {
        schoolId,
        isActive: true,
        eventDate: { gte: today },
      },
      orderBy: { eventDate: "asc" },
      take: limit,
    });
    ok = true;
    return data;
  } finally {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    recordDashboardQuery("upcoming_events", durationMs, ok);
  }
}
