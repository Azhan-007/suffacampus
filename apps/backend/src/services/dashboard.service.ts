import { prisma } from "../lib/prisma";
import { recordDashboardQuery, recordSingleflightCoalesce } from "../plugins/metrics";
import { moneyFrom, moneyToNumber } from "../utils/safe-fields";
import { assertSchoolScope } from "../lib/tenant-scope";
import { cacheGet, cacheSet } from "../lib/cache";

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

// Singleflight map: when cache misses, only one request per school
// actually runs the DB queries. All other concurrent callers await
// the same in-flight promise. Prevents cache stampede.
const inflight = new Map<string, Promise<DashboardStats>>();

export async function getDashboardStats(schoolId: string): Promise<DashboardStats> {
  assertSchoolScope(schoolId);

  // Check cache first (60s TTL)
  const cacheKey = `dashboard:stats:${schoolId}`;
  const cached = await cacheGet<DashboardStats>(cacheKey);
  if (cached) return cached;

  // Singleflight: if another request is already computing this school's
  // stats, wait for that result instead of firing 6 more DB queries.
  const existing = inflight.get(cacheKey);
  if (existing) {
    recordSingleflightCoalesce("dashboard");
    return existing;
  }

  const promise = computeDashboardStats(schoolId, cacheKey);
  inflight.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    inflight.delete(cacheKey);
  }
}

async function computeDashboardStats(schoolId: string, cacheKey: string): Promise<DashboardStats> {
  const started = process.hrtime.bigint();
  let ok = false;
  try {
    const [
      totalStudents,
      totalTeachers,
      totalClasses,
      totalEvents,
      totalBooks,
      feeAgg,
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

    const totalFees = moneyToNumber(moneyFrom(feeAgg._sum.amount));
    const collectedFees = moneyToNumber(moneyFrom(feeAgg._sum.amountPaid));
    const pendingFees = totalFees - collectedFees;

    const payload = {
      totalStudents,
      totalTeachers,
      totalClasses,
      totalEvents,
      totalBooks,
      totalFees,
      collectedFees,
      pendingFees,
    };
    ok = true;
    void cacheSet(cacheKey, payload, 60); // 60s TTL — fire and forget
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
  assertSchoolScope(schoolId);

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
  assertSchoolScope(schoolId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
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
