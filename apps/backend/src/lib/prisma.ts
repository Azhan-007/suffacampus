import { PrismaClient } from "@prisma/client";
import { Errors } from "../errors";
import { getTenantContext } from "./tenant-context";

/**
 * Singleton Prisma client.
 *
 * In development, we store the client on `globalThis` so that hot-reloading
 * (via `tsx watch`) doesn't create a new connection pool on every restart.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const TENANT_SCOPED_MODELS = new Set<string>([
  "User",
  "Student",
  "Teacher",
  "Class",
  "Attendance",
  "Assignment",
  "Event",
  "Fee",
  "FeeStructure",
  "StudentFee",
  "Payment",
  "Book",
  "LibraryTransaction",
  "Result",
  "Timetable",
  "Subscription",
  "Invoice",
  "Report",
  "ParentInvite",
  "DeviceToken",
  "LegacyPayment",
  "Notification",
  "NotificationPreference",
  "AuditLog",
  "ApiKey",
  "QuestionBank",
  "Carousel",
  "UsageRecord",
  "DataRequest",
  "WebhookConfig",
  "WebhookDelivery",
  "Activity",
  "SchoolConfig",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDelegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function getEnforcedSchoolId(): string | null {
  const ctx = getTenantContext();
  if (!ctx?.enforceTenant) return null;

  const schoolId = ctx.schoolId?.trim();
  if (!schoolId) {
    throw Errors.tenantMissing();
  }

  return schoolId;
}

function mergeWhereWithSchoolId(where: unknown, schoolId: string): Record<string, unknown> {
  if (!isRecord(where)) {
    return { schoolId };
  }

  return {
    AND: [where, { schoolId }],
  };
}

function enforceCreateDataSchoolId(data: unknown, schoolId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => enforceCreateDataSchoolId(item, schoolId));
  }

  if (!isRecord(data)) {
    return data;
  }

  if (Object.prototype.hasOwnProperty.call(data, "schoolId")) {
    const current = String((data as { schoolId?: unknown }).schoolId ?? "").trim();
    if (current.length > 0 && current !== schoolId) {
      throw Errors.tenantMismatch();
    }

    return { ...data, schoolId };
  }

  return { ...data, schoolId };
}

function enforceUpdateDataSchoolId(data: unknown, schoolId: string): unknown {
  if (!isRecord(data) || !Object.prototype.hasOwnProperty.call(data, "schoolId")) {
    return data;
  }

  const raw = (data as { schoolId?: unknown }).schoolId;
  const value = isRecord(raw) && Object.prototype.hasOwnProperty.call(raw, "set")
    ? (raw as { set?: unknown }).set
    : raw;

  const assigned = String(value ?? "").trim();
  if (assigned.length > 0 && assigned !== schoolId) {
    throw Errors.tenantMismatch();
  }

  return data;
}

async function ensureTenantRecordOwnership(
  basePrisma: PrismaClient,
  model: string,
  where: unknown,
  schoolId: string
): Promise<void> {
  const delegate = (basePrisma as Record<string, any>)[toDelegateName(model)];
  if (!delegate) return;

  const existing = await delegate.findFirst({
    where: mergeWhereWithSchoolId(where, schoolId),
    select: { id: true },
  });

  if (!existing) {
    throw Errors.notFound(model);
  }
}

function withPoolTuning(databaseUrl?: string): string | undefined {
  if (!databaseUrl) return undefined;

  try {
    const parsed = new URL(databaseUrl);

    // Keep lower pool in development and increase in non-dev environments.
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set(
        "connection_limit",
        process.env.NODE_ENV === "development" ? "20" : "50"
      );
    }

    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "20");
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, keep the original value untouched.
    return databaseUrl;
  }
}

const tunedDatabaseUrl = withPoolTuning(process.env.DATABASE_URL);

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(tunedDatabaseUrl
      ? {
          datasources: {
            db: {
              url: tunedDatabaseUrl,
            },
          },
        }
      : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

export const prisma = basePrisma.$extends({
  name: "tenant-isolation",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_SCOPED_MODELS.has(model)) {
          return query(args);
        }

        const schoolId = getEnforcedSchoolId();
        if (!schoolId) {
          return query(args);
        }

        const delegate = (basePrisma as Record<string, any>)[toDelegateName(model)];
        const mutableArgs = (args ?? {}) as Record<string, unknown>;

        switch (operation) {
          case "findMany":
          case "findFirst":
          case "count":
          case "aggregate":
          case "groupBy":
          case "updateMany":
          case "deleteMany": {
            return query({
              ...mutableArgs,
              where: mergeWhereWithSchoolId(mutableArgs.where, schoolId),
            } as any);
          }

          case "findUnique": {
            return delegate.findFirst({
              ...mutableArgs,
              where: mergeWhereWithSchoolId(mutableArgs.where, schoolId),
            });
          }

          case "findUniqueOrThrow": {
            const record = await delegate.findFirst({
              ...mutableArgs,
              where: mergeWhereWithSchoolId(mutableArgs.where, schoolId),
            });

            if (!record) {
              throw Errors.notFound(model);
            }

            return record;
          }

          case "create": {
            return query({
              ...mutableArgs,
              data: enforceCreateDataSchoolId(mutableArgs.data, schoolId),
            } as any);
          }

          case "createMany": {
            return query({
              ...mutableArgs,
              data: enforceCreateDataSchoolId(mutableArgs.data, schoolId),
            } as any);
          }

          case "update": {
            await ensureTenantRecordOwnership(basePrisma, model, mutableArgs.where, schoolId);
            return query({
              ...mutableArgs,
              data: enforceUpdateDataSchoolId(mutableArgs.data, schoolId),
            } as any);
          }

          case "delete": {
            await ensureTenantRecordOwnership(basePrisma, model, mutableArgs.where, schoolId);
            return query(mutableArgs);
          }

          case "upsert": {
            const scoped = await delegate.findFirst({
              where: mergeWhereWithSchoolId(mutableArgs.where, schoolId),
              select: { id: true },
            });

            if (!scoped) {
              const unscoped = await delegate.findFirst({
                where: mutableArgs.where,
                select: { id: true },
              });
              if (unscoped) {
                throw Errors.tenantMismatch();
              }
            }

            return query({
              ...mutableArgs,
              create: enforceCreateDataSchoolId(mutableArgs.create, schoolId),
              update: enforceUpdateDataSchoolId(mutableArgs.update, schoolId),
            } as any);
          }

          default:
            return query(args);
        }
      },
    },
  },
});
