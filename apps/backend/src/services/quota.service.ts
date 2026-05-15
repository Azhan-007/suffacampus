import { Prisma } from "@prisma/client";
import { prisma, type PrismaTransactionClient } from "../lib/prisma";
import { Errors } from "../errors";
import {
  assertSchoolScope,
  resolveStudentLimitForPlan,
  resolveTeacherLimitForPlan,
} from "../lib/tenant-scope";
import { writeAuditLog } from "./audit.service";
import { createLogger } from "../utils/logger";

const log = createLogger("quota-service");
const MAX_RETRIES = 4;
const STALE_COUNTER_THRESHOLD_MS = 10 * 60 * 1000;

let usageCounterTableAvailable: boolean | null = null;

export type QuotaResourceType = "students" | "teachers" | "storage";

export type QuotaReservation = {
  mode: "counter" | "fallback" | "unlimited";
  schoolId: string;
  resourceType: QuotaResourceType;
  amount: number;
  limit: number;
  used: number;
  reserved: number;
};

export type QuotaValidation = {
  schoolId: string;
  resourceType: QuotaResourceType;
  limit: number;
  used: number;
  reserved: number;
  effectiveUsed: number;
  source: "usage_counter" | "school_fallback";
  stale: boolean;
};

type SchoolQuotaSnapshot = {
  subscriptionPlan: string;
  maxStudents: number;
  maxTeachers: number;
  maxStorage: number;
  currentStudents: number;
  currentTeachers: number;
  currentStorage: number;
};

type UsageCounterSnapshot = {
  id: string;
  schoolId: string;
  resourceType: QuotaResourceType;
  used: number;
  reserved: number;
  limitSnapshot: number | null;
  version: number;
  updatedAt: Date;
};

function isSchemaCompatibilityError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function markUsageCounterUnavailable(error: unknown): void {
  if (isSchemaCompatibilityError(error)) {
    usageCounterTableAvailable = false;
  }
}

export function resetUsageCounterCompatibilityCache(): void {
  usageCounterTableAvailable = null;
}

function pickPrismaClient(tx?: PrismaTransactionClient) {
  return tx ?? prisma;
}

function normalizeAmount(amount?: number): number {
  if (amount === undefined) return 1;
  if (!Number.isFinite(amount)) {
    throw Errors.badRequest("amount must be a finite number");
  }
  const normalized = Math.trunc(amount);
  if (normalized < 1) {
    throw Errors.badRequest("amount must be at least 1");
  }
  return normalized;
}

function resolvePlanLimit(snapshot: SchoolQuotaSnapshot, resourceType: QuotaResourceType): number {
  if (resourceType === "students") {
    return resolveStudentLimitForPlan(snapshot.subscriptionPlan, snapshot.maxStudents);
  }

  if (resourceType === "teachers") {
    return resolveTeacherLimitForPlan(snapshot.subscriptionPlan, snapshot.maxTeachers);
  }

  return snapshot.maxStorage ?? 0;
}

async function fetchSchoolSnapshot(
  schoolId: string,
  client: PrismaTransactionClient | typeof prisma
): Promise<SchoolQuotaSnapshot> {
  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: {
      subscriptionPlan: true,
      maxStudents: true,
      maxTeachers: true,
      maxStorage: true,
      currentStudents: true,
      currentTeachers: true,
      currentStorage: true,
    },
  });

  if (!school) {
    throw Errors.notFound("School", schoolId);
  }

  return {
    subscriptionPlan: school.subscriptionPlan,
    maxStudents: school.maxStudents,
    maxTeachers: school.maxTeachers,
    maxStorage: school.maxStorage,
    currentStudents: school.currentStudents ?? 0,
    currentTeachers: school.currentTeachers ?? 0,
    currentStorage: school.currentStorage ?? 0,
  };
}

async function resolveActualUsage(
  schoolId: string,
  resourceType: QuotaResourceType,
  client: PrismaTransactionClient | typeof prisma,
  schoolSnapshot?: SchoolQuotaSnapshot
): Promise<number> {
  if (resourceType === "students") {
    return client.student.count({
      where: { schoolId, isDeleted: false },
    });
  }

  if (resourceType === "teachers") {
    return client.teacher.count({
      where: { schoolId, isDeleted: false },
    });
  }

  if (schoolSnapshot) {
    return schoolSnapshot.currentStorage ?? 0;
  }

  const school = await fetchSchoolSnapshot(schoolId, client);
  return school.currentStorage ?? 0;
}

async function getUsageCounter(
  schoolId: string,
  resourceType: QuotaResourceType,
  client: PrismaTransactionClient | typeof prisma
): Promise<UsageCounterSnapshot | null> {
  const delegate = (client as { tenantUsageCounter?: { findUnique?: unknown } })
    .tenantUsageCounter;
  if (!delegate || typeof delegate.findUnique !== "function") {
    usageCounterTableAvailable = false;
    return null;
  }

  if (usageCounterTableAvailable === false) return null;

  try {
    const record = await client.tenantUsageCounter.findUnique({
      where: {
        schoolId_resourceType: {
          schoolId,
          resourceType: resourceType as any,
        },
      },
    });

    if (!record) return null;

    usageCounterTableAvailable = true;

    return {
      id: record.id,
      schoolId: record.schoolId,
      resourceType: record.resourceType as QuotaResourceType,
      used: record.used ?? 0,
      reserved: record.reserved ?? 0,
      limitSnapshot: record.limitSnapshot ?? null,
      version: record.version ?? 0,
      updatedAt: record.updatedAt ?? new Date(0),
    };
  } catch (error) {
    markUsageCounterUnavailable(error);
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }
    return null;
  }
}

async function ensureUsageCounter(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  limit: number;
  used: number;
  client: PrismaTransactionClient | typeof prisma;
}): Promise<UsageCounterSnapshot | null> {
  if (usageCounterTableAvailable === false) return null;

  const existing = await getUsageCounter(params.schoolId, params.resourceType, params.client);
  if (existing) return existing;

  const createDelegate = (params.client as { tenantUsageCounter?: { create?: unknown } })
    .tenantUsageCounter;
  if (!createDelegate || typeof createDelegate.create !== "function") {
    usageCounterTableAvailable = false;
    return null;
  }

  try {
    const created = await params.client.tenantUsageCounter.create({
      data: {
        schoolId: params.schoolId,
        resourceType: params.resourceType as any,
        used: params.used,
        reserved: 0,
        limitSnapshot: params.limit,
        version: 1,
      },
    });

    usageCounterTableAvailable = true;

    return {
      id: created.id,
      schoolId: created.schoolId,
      resourceType: created.resourceType as QuotaResourceType,
      used: created.used ?? 0,
      reserved: created.reserved ?? 0,
      limitSnapshot: created.limitSnapshot ?? null,
      version: created.version ?? 0,
      updatedAt: created.updatedAt ?? new Date(),
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return getUsageCounter(params.schoolId, params.resourceType, params.client);
    }

    markUsageCounterUnavailable(error);
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }
    return null;
  }
}

async function syncSchoolCounter(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  used: number;
  client: PrismaTransactionClient | typeof prisma;
}): Promise<void> {
  if (params.resourceType === "students") {
    await params.client.school.updateMany({
      where: { id: params.schoolId },
      data: { currentStudents: params.used },
    });
    return;
  }

  if (params.resourceType === "teachers") {
    await params.client.school.updateMany({
      where: { id: params.schoolId },
      data: { currentTeachers: params.used },
    });
  }
}

async function incrementSchoolCounter(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  amount: number;
  client: PrismaTransactionClient | typeof prisma;
}): Promise<void> {
  if (params.resourceType === "students") {
    await params.client.school.updateMany({
      where: { id: params.schoolId },
      data: { currentStudents: { increment: params.amount } },
    });
    return;
  }

  if (params.resourceType === "teachers") {
    await params.client.school.updateMany({
      where: { id: params.schoolId },
      data: { currentTeachers: { increment: params.amount } },
    });
  }
}

async function decrementSchoolCounter(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  amount: number;
  client: PrismaTransactionClient | typeof prisma;
}): Promise<void> {
  if (params.resourceType === "students") {
    await params.client.school.updateMany({
      where: { id: params.schoolId },
      data: { currentStudents: { decrement: params.amount } },
    });
    return;
  }

  if (params.resourceType === "teachers") {
    await params.client.school.updateMany({
      where: { id: params.schoolId },
      data: { currentTeachers: { decrement: params.amount } },
    });
  }
}

export async function validateQuota(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  incoming?: number;
  limitOverride?: number;
  schoolSnapshot?: SchoolQuotaSnapshot;
  useTransaction?: PrismaTransactionClient;
  staleThresholdMs?: number;
}): Promise<QuotaValidation> {
  assertSchoolScope(params.schoolId);

  const client = pickPrismaClient(params.useTransaction);
  const amount = normalizeAmount(params.incoming);
  const schoolSnapshot =
    params.schoolSnapshot ?? (await fetchSchoolSnapshot(params.schoolId, client));
  const limit =
    typeof params.limitOverride === "number"
      ? params.limitOverride
      : resolvePlanLimit(schoolSnapshot, params.resourceType);

  if (limit === -1) {
    return {
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      limit,
      used: 0,
      reserved: 0,
      effectiveUsed: 0,
      source: "usage_counter",
      stale: false,
    };
  }

  const counter = await getUsageCounter(params.schoolId, params.resourceType, client);
  const now = Date.now();
  const staleThreshold = params.staleThresholdMs ?? STALE_COUNTER_THRESHOLD_MS;
  const stale =
    counter?.updatedAt
      ? now - counter.updatedAt.getTime() > staleThreshold
      : true;

  let actualUsage = counter?.used ?? 0;
  if (!counter || stale) {
    actualUsage = await resolveActualUsage(
      params.schoolId,
      params.resourceType,
      client,
      schoolSnapshot
    );
  }

  const reserved = counter?.reserved ?? 0;
  const effectiveUsed = Math.max(counter?.used ?? 0, actualUsage);

  if (effectiveUsed + reserved + amount > limit) {
    throw Errors.subscriptionLimitReached(params.resourceType, limit);
  }

  return {
    schoolId: params.schoolId,
    resourceType: params.resourceType,
    limit,
    used: counter?.used ?? actualUsage,
    reserved,
    effectiveUsed,
    source: counter ? "usage_counter" : "school_fallback",
    stale: Boolean(stale),
  };
}

export async function reserveCapacity(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  amount?: number;
  limitOverride?: number;
  schoolSnapshot?: SchoolQuotaSnapshot;
  useTransaction?: PrismaTransactionClient;
  staleThresholdMs?: number;
}): Promise<QuotaReservation> {
  assertSchoolScope(params.schoolId);

  const client = pickPrismaClient(params.useTransaction);
  const amount = normalizeAmount(params.amount);
  const schoolSnapshot =
    params.schoolSnapshot ?? (await fetchSchoolSnapshot(params.schoolId, client));
  const limit =
    typeof params.limitOverride === "number"
      ? params.limitOverride
      : resolvePlanLimit(schoolSnapshot, params.resourceType);
  const effectiveLimit = limit === -1 ? Number.MAX_SAFE_INTEGER : limit;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const counter = await getUsageCounter(params.schoolId, params.resourceType, client);
    const now = Date.now();
    const staleThreshold = params.staleThresholdMs ?? STALE_COUNTER_THRESHOLD_MS;
    const stale =
      counter?.updatedAt
        ? now - counter.updatedAt.getTime() > staleThreshold
        : true;

    const actualUsage = (!counter || stale)
      ? await resolveActualUsage(
          params.schoolId,
          params.resourceType,
          client,
          schoolSnapshot
        )
      : counter.used;

    const effectiveUsed = Math.max(counter?.used ?? 0, actualUsage);
    const reserved = counter?.reserved ?? 0;

    if (effectiveUsed + reserved + amount > effectiveLimit) {
      throw Errors.subscriptionLimitReached(params.resourceType, limit);
    }

    if (usageCounterTableAvailable === false) {
      return {
        mode: "fallback",
        schoolId: params.schoolId,
        resourceType: params.resourceType,
        amount,
        limit,
        used: effectiveUsed,
        reserved,
      };
    }

    if (!counter) {
      const created = await ensureUsageCounter({
        schoolId: params.schoolId,
        resourceType: params.resourceType,
        limit,
        used: effectiveUsed,
        client,
      });

      if (!created) {
        return {
          mode: "fallback",
          schoolId: params.schoolId,
          resourceType: params.resourceType,
          amount,
          limit,
          used: effectiveUsed,
          reserved,
        };
      }

      const updated = await client.tenantUsageCounter.updateMany({
        where: {
          id: created.id,
          version: created.version,
        },
        data: {
          reserved: { increment: amount },
          limitSnapshot: limit,
          version: created.version + 1,
        },
      });

      if (updated.count === 1) {
        if (effectiveUsed > created.used) {
          await syncSchoolCounter({
            schoolId: params.schoolId,
            resourceType: params.resourceType,
            used: effectiveUsed,
            client,
          });
        }

        return {
          mode: "counter",
          schoolId: params.schoolId,
          resourceType: params.resourceType,
          amount,
          limit,
          used: effectiveUsed,
          reserved: created.reserved + amount,
        };
      }

      continue;
    }

    const shouldBumpUsed = effectiveUsed > counter.used;

    const updated = await client.tenantUsageCounter.updateMany({
      where: {
        id: counter.id,
        version: counter.version,
      },
      data: {
        reserved: { increment: amount },
        limitSnapshot: limit,
        ...(shouldBumpUsed ? { used: effectiveUsed } : {}),
        version: counter.version + 1,
      },
    });

    if (updated.count === 0) {
      continue;
    }

    if (shouldBumpUsed) {
      await syncSchoolCounter({
        schoolId: params.schoolId,
        resourceType: params.resourceType,
        used: effectiveUsed,
        client,
      });
    }

    return {
      mode: "counter",
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      amount,
      limit,
      used: shouldBumpUsed ? effectiveUsed : counter.used,
      reserved: counter.reserved + amount,
    };
  }

  throw Errors.conflict("Quota reservation conflict. Please retry.");
}

export async function consumeReservedCapacity(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  amount?: number;
  useTransaction?: PrismaTransactionClient;
  limitOverride?: number;
  schoolSnapshot?: SchoolQuotaSnapshot;
}): Promise<void> {
  assertSchoolScope(params.schoolId);

  const client = pickPrismaClient(params.useTransaction);
  const amount = normalizeAmount(params.amount);
  const schoolSnapshot =
    params.schoolSnapshot ?? (await fetchSchoolSnapshot(params.schoolId, client));
  const limit =
    typeof params.limitOverride === "number"
      ? params.limitOverride
      : resolvePlanLimit(schoolSnapshot, params.resourceType);
  const isUnlimited = limit === -1;

  if (usageCounterTableAvailable === false) {
    await incrementSchoolCounter({
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      amount,
      client,
    });
    return;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const counter = await ensureUsageCounter({
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      limit,
      used: await resolveActualUsage(
        params.schoolId,
        params.resourceType,
        client,
        schoolSnapshot
      ),
      client,
    });

    if (!counter) {
      await incrementSchoolCounter({
        schoolId: params.schoolId,
        resourceType: params.resourceType,
        amount,
        client,
      });
      return;
    }

    if (!isUnlimited && counter.reserved < amount) {
      log.warn(
        { schoolId: params.schoolId, resourceType: params.resourceType, reserved: counter.reserved, amount },
        "Reserved quota below requested consume amount"
      );
    }

    const updated = await client.tenantUsageCounter.updateMany({
      where: {
        id: counter.id,
        version: counter.version,
      },
      data: {
        reserved: { decrement: Math.min(counter.reserved, amount) },
        used: { increment: amount },
        limitSnapshot: limit,
        version: counter.version + 1,
      },
    });

    if (updated.count === 0) {
      continue;
    }

    await syncSchoolCounter({
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      used: counter.used + amount,
      client,
    });

    return;
  }

  throw Errors.conflict("Quota consume conflict. Please retry.");
}

export async function releaseReservedCapacity(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  amount?: number;
  useTransaction?: PrismaTransactionClient;
  limitOverride?: number;
  schoolSnapshot?: SchoolQuotaSnapshot;
}): Promise<void> {
  assertSchoolScope(params.schoolId);

  const client = pickPrismaClient(params.useTransaction);
  const amount = normalizeAmount(params.amount);

  if (usageCounterTableAvailable === false) {
    return;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const counter = await getUsageCounter(params.schoolId, params.resourceType, client);
    if (!counter) return;

    const decrementAmount = Math.min(counter.reserved, amount);

    const updated = await client.tenantUsageCounter.updateMany({
      where: {
        id: counter.id,
        version: counter.version,
      },
      data: {
        reserved: { decrement: decrementAmount },
        version: counter.version + 1,
      },
    });

    if (updated.count === 0) {
      continue;
    }

    if (decrementAmount < amount) {
      log.warn(
        { schoolId: params.schoolId, resourceType: params.resourceType, reserved: counter.reserved, amount },
        "Reserved quota lower than requested release amount"
      );
    }

    return;
  }

  throw Errors.conflict("Quota release conflict. Please retry.");
}

export async function decrementUsage(params: {
  schoolId: string;
  resourceType: QuotaResourceType;
  amount?: number;
  useTransaction?: PrismaTransactionClient;
  limitOverride?: number;
  schoolSnapshot?: SchoolQuotaSnapshot;
}): Promise<void> {
  assertSchoolScope(params.schoolId);

  const client = pickPrismaClient(params.useTransaction);
  const amount = normalizeAmount(params.amount);

  if (usageCounterTableAvailable === false) {
    await decrementSchoolCounter({
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      amount,
      client,
    });
    return;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const counter = await getUsageCounter(params.schoolId, params.resourceType, client);
    if (!counter) {
      await decrementSchoolCounter({
        schoolId: params.schoolId,
        resourceType: params.resourceType,
        amount,
        client,
      });
      return;
    }

    const decrementAmount = Math.min(counter.used, amount);

    const updated = await client.tenantUsageCounter.updateMany({
      where: {
        id: counter.id,
        version: counter.version,
      },
      data: {
        used: { decrement: decrementAmount },
        version: counter.version + 1,
      },
    });

    if (updated.count === 0) {
      continue;
    }

    await syncSchoolCounter({
      schoolId: params.schoolId,
      resourceType: params.resourceType,
      used: Math.max(counter.used - decrementAmount, 0),
      client,
    });

    return;
  }

  throw Errors.conflict("Quota decrement conflict. Please retry.");
}

export async function reconcileUsageCounters(params?: {
  schoolIds?: string[];
  mode?: "report" | "repair";
  allowDecrease?: boolean;
}): Promise<{
  checked: number;
  discrepancies: number;
}> {
  const mode = params?.mode ?? "report";
  const allowDecrease = params?.allowDecrease ?? false;

  const schoolFilter = params?.schoolIds?.length
    ? { id: { in: params.schoolIds } }
    : undefined;

  const schools = await prisma.school.findMany({
    where: schoolFilter,
    select: {
      id: true,
      subscriptionPlan: true,
      maxStudents: true,
      maxTeachers: true,
      currentStudents: true,
      currentTeachers: true,
    },
  });

  if (schools.length === 0) {
    return { checked: 0, discrepancies: 0 };
  }

  const schoolIds = schools.map((school) => school.id);

  const [studentCounts, teacherCounts] = await Promise.all([
    prisma.student.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, isDeleted: false },
      _count: true,
    }),
    prisma.teacher.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, isDeleted: false },
      _count: true,
    }),
  ]);

  const studentMap = new Map(studentCounts.map((row) => [row.schoolId, row._count]));
  const teacherMap = new Map(teacherCounts.map((row) => [row.schoolId, row._count]));

  let counters: Array<{
    id: string;
    schoolId: string;
    resourceType: string;
    used: number;
    reserved: number;
    limitSnapshot: number | null;
    version: number;
    updatedAt: Date;
  }> = [];

  try {
    counters = await prisma.tenantUsageCounter.findMany({
      where: {
        schoolId: { in: schoolIds },
        resourceType: { in: ["students", "teachers"] },
      },
    });
  } catch (error) {
    markUsageCounterUnavailable(error);
    if (isSchemaCompatibilityError(error)) {
      log.warn("Usage counter table unavailable; reconciliation skipped");
      return { checked: 0, discrepancies: 0 };
    }
    throw error;
  }

  const counterMap = new Map<string, UsageCounterSnapshot>();
  for (const counter of counters) {
    counterMap.set(`${counter.schoolId}:${counter.resourceType}`, {
      id: counter.id,
      schoolId: counter.schoolId,
      resourceType: counter.resourceType as QuotaResourceType,
      used: counter.used ?? 0,
      reserved: counter.reserved ?? 0,
      limitSnapshot: counter.limitSnapshot ?? null,
      version: counter.version ?? 0,
      updatedAt: counter.updatedAt ?? new Date(0),
    });
  }

  let discrepancies = 0;

  for (const school of schools) {
    const actualStudents = studentMap.get(school.id) ?? 0;
    const actualTeachers = teacherMap.get(school.id) ?? 0;

    const studentCounter = counterMap.get(`${school.id}:students`);
    const teacherCounter = counterMap.get(`${school.id}:teachers`);

    const studentDiff = studentCounter
      ? actualStudents - studentCounter.used
      : actualStudents;
    const teacherDiff = teacherCounter
      ? actualTeachers - teacherCounter.used
      : actualTeachers;

    if (studentDiff !== 0 || teacherDiff !== 0) {
      discrepancies += 1;

      log.warn(
        {
          schoolId: school.id,
          studentDiff,
          teacherDiff,
          studentCounter: studentCounter?.used ?? null,
          teacherCounter: teacherCounter?.used ?? null,
        },
        "Quota usage drift detected"
      );

      await writeAuditLog("QUOTA_RECONCILE", "system", school.id, {
        studentDiff,
        teacherDiff,
        studentCounter: studentCounter?.used ?? null,
        teacherCounter: teacherCounter?.used ?? null,
        actualStudents,
        actualTeachers,
        mode,
      });
    }

    if (mode === "repair") {
      const studentTarget = allowDecrease
        ? actualStudents
        : Math.max(studentCounter?.used ?? 0, actualStudents);
      const teacherTarget = allowDecrease
        ? actualTeachers
        : Math.max(teacherCounter?.used ?? 0, actualTeachers);

      if (studentCounter) {
        await prisma.tenantUsageCounter.update({
          where: { id: studentCounter.id },
          data: { used: studentTarget },
        });
      } else if (actualStudents > 0) {
        await prisma.tenantUsageCounter.create({
          data: {
            schoolId: school.id,
            resourceType: "students",
            used: studentTarget,
            reserved: 0,
            limitSnapshot: resolveStudentLimitForPlan(
              school.subscriptionPlan,
              school.maxStudents
            ),
            version: 1,
          },
        });
      }

      if (teacherCounter) {
        await prisma.tenantUsageCounter.update({
          where: { id: teacherCounter.id },
          data: { used: teacherTarget },
        });
      } else if (actualTeachers > 0) {
        await prisma.tenantUsageCounter.create({
          data: {
            schoolId: school.id,
            resourceType: "teachers",
            used: teacherTarget,
            reserved: 0,
            limitSnapshot: resolveTeacherLimitForPlan(
              school.subscriptionPlan,
              school.maxTeachers
            ),
            version: 1,
          },
        });
      }
    }
  }

  return { checked: schools.length, discrepancies };
}
