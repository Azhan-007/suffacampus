import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "../lib/firebase-admin";
import type { CreateSchoolInput, UpdateSchoolAdminInput } from "../schemas/admin.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import crypto from "crypto";
import { createLogger } from "../utils/logger";
import {
  assertSchoolScope,
  normalizeTenantPlan,
  resolveStudentLimitForPlan,
  resolveTeacherLimitForPlan,
} from "../lib/tenant-scope";

const log = createLogger("admin-school-service");

const SCHOOL_SCHEMA_IDENTIFIERS = ["School", "school"];

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isSchemaCompatibilityError(error: unknown, identifiers = SCHOOL_SCHEMA_IDENTIFIERS): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2021" && error.code !== "P2022") {
    return false;
  }

  const table = String((error.meta as { table?: unknown } | undefined)?.table ?? "");
  const column = String((error.meta as { column?: unknown } | undefined)?.column ?? "");

  if (!table && !column) {
    return true;
  }

  return identifiers.some(
    (identifier) => table.includes(identifier) || column.includes(identifier)
  );
}

async function getSchoolTableColumns(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('School', 'school')
  `;

  return new Set(rows.map((row) => row.column_name));
}

function selectColumnExpr(columns: Set<string>, column: string, fallbackSql: string): string {
  if (columns.has(column)) {
    return `"${column}" AS "${column}"`;
  }

  return `${fallbackSql} AS "${column}"`;
}

function mapSchoolRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address ?? null,
    city: row.city ?? "",
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    phone: row.phone ?? null,
    email: row.email ?? "",
    website: row.website ?? null,
    logoURL: row.logoURL ?? null,
    principalName: row.principalName ?? null,
    primaryColor: row.primaryColor ?? "#1a73e8",
    secondaryColor: row.secondaryColor ?? "#4285f4",
    subscriptionPlan: row.subscriptionPlan ?? "free",
    subscriptionStatus: row.subscriptionStatus ?? "trial",
    subscriptionStartDate: row.subscriptionStartDate ?? null,
    subscriptionEndDate: row.subscriptionEndDate ?? null,
    maxStudents: row.maxStudents ?? 0,
    maxTeachers: row.maxTeachers ?? 0,
    maxStorage: row.maxStorage ?? 0,
    currentStudents: row.currentStudents ?? 0,
    currentTeachers: row.currentTeachers ?? 0,
    currentStorage: row.currentStorage ?? 0,
    timezone: row.timezone ?? "Asia/Kolkata",
    currency: row.currency ?? "INR",
    dateFormat: row.dateFormat ?? "DD/MM/YYYY",
    currentSession: row.currentSession ?? null,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

async function getSchoolsCompatibility(
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { status?: string; plan?: string; search?: string } = {}
) {
  const columns = await getSchoolTableColumns();

  if (!columns.has("id")) {
    return {
      data: [] as Record<string, unknown>[],
      pagination: { cursor: null as string | null, hasMore: false, limit: Math.min(pagination.limit ?? 20, 100) },
    };
  }

  const limit = Math.min(pagination.limit ?? 20, 100);
  const params: unknown[] = [];
  const where: string[] = [];

  if (columns.has("isActive")) {
    params.push(true);
    where.push(`"isActive" = $${params.length}`);
  }

  if (filters.status && columns.has("subscriptionStatus")) {
    params.push(filters.status);
    where.push(`"subscriptionStatus" = $${params.length}`);
  }

  if (filters.plan && columns.has("subscriptionPlan")) {
    params.push(filters.plan);
    where.push(`"subscriptionPlan" = $${params.length}`);
  }

  if (filters.search) {
    const searchColumns = ["name", "code", "city"].filter((column) => columns.has(column));
    if (searchColumns.length > 0) {
      params.push(`%${filters.search}%`);
      const token = `$${params.length}`;
      where.push(`(${searchColumns.map((column) => `"${column}" ILIKE ${token}`).join(" OR ")})`);
    }
  }

  if (pagination.cursor) {
    params.push(pagination.cursor);
    where.push(`"id" > $${params.length}`);
  }

  const sortableColumns = [
    "id",
    "name",
    "code",
    "city",
    "createdAt",
    "updatedAt",
    "subscriptionPlan",
    "subscriptionStatus",
  ];

  const preferredSort =
    pagination.sortBy && sortableColumns.includes(pagination.sortBy)
      ? pagination.sortBy
      : columns.has("createdAt")
        ? "createdAt"
        : columns.has("name")
          ? "name"
          : "id";

  const sortColumn = columns.has(preferredSort) ? preferredSort : "id";
  const sortOrder = pagination.sortOrder === "asc" ? "ASC" : "DESC";

  const selectColumns = [
    selectColumnExpr(columns, "id", "''::text"),
    selectColumnExpr(columns, "name", "''::text"),
    selectColumnExpr(columns, "code", "''::text"),
    selectColumnExpr(columns, "address", "NULL::text"),
    selectColumnExpr(columns, "city", "''::text"),
    selectColumnExpr(columns, "state", "NULL::text"),
    selectColumnExpr(columns, "pincode", "NULL::text"),
    selectColumnExpr(columns, "phone", "NULL::text"),
    selectColumnExpr(columns, "email", "''::text"),
    selectColumnExpr(columns, "website", "NULL::text"),
    selectColumnExpr(columns, "logoURL", "NULL::text"),
    selectColumnExpr(columns, "principalName", "NULL::text"),
    selectColumnExpr(columns, "primaryColor", "'#1a73e8'::text"),
    selectColumnExpr(columns, "secondaryColor", "'#4285f4'::text"),
    selectColumnExpr(columns, "subscriptionPlan", "'free'::text"),
    selectColumnExpr(columns, "subscriptionStatus", "'trial'::text"),
    selectColumnExpr(columns, "subscriptionStartDate", "NULL::timestamptz"),
    selectColumnExpr(columns, "subscriptionEndDate", "NULL::timestamptz"),
    selectColumnExpr(columns, "maxStudents", "0::int"),
    selectColumnExpr(columns, "maxTeachers", "0::int"),
    selectColumnExpr(columns, "maxStorage", "0::int"),
    selectColumnExpr(columns, "currentStudents", "0::int"),
    selectColumnExpr(columns, "currentTeachers", "0::int"),
    selectColumnExpr(columns, "currentStorage", "0::int"),
    selectColumnExpr(columns, "timezone", "'Asia/Kolkata'::text"),
    selectColumnExpr(columns, "currency", "'INR'::text"),
    selectColumnExpr(columns, "dateFormat", "'DD/MM/YYYY'::text"),
    selectColumnExpr(columns, "currentSession", "NULL::text"),
    selectColumnExpr(columns, "isActive", "true"),
    selectColumnExpr(columns, "createdAt", "now()"),
    selectColumnExpr(columns, "updatedAt", "now()"),
  ];

  params.push(limit + 1);
  const limitToken = `$${params.length}`;

  const query = `
    SELECT ${selectColumns.join(", ")}
    FROM "School"
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY "${sortColumn}" ${sortOrder}, "id" ASC
    LIMIT ${limitToken}
  `;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(query, ...params);
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  const mapped = data.map(mapSchoolRow);

  return {
    data: mapped,
    pagination: {
      cursor: mapped.length > 0 ? String(mapped[mapped.length - 1].id) : null,
      hasMore,
      limit,
    },
  };
}

async function getSchoolByIdCompatibility(schoolId: string): Promise<Record<string, unknown> | null> {
  const columns = await getSchoolTableColumns();
  if (!columns.has("id")) return null;

  const selectColumns = [
    selectColumnExpr(columns, "id", "''::text"),
    selectColumnExpr(columns, "name", "''::text"),
    selectColumnExpr(columns, "code", "''::text"),
    selectColumnExpr(columns, "address", "NULL::text"),
    selectColumnExpr(columns, "city", "''::text"),
    selectColumnExpr(columns, "state", "NULL::text"),
    selectColumnExpr(columns, "pincode", "NULL::text"),
    selectColumnExpr(columns, "phone", "NULL::text"),
    selectColumnExpr(columns, "email", "''::text"),
    selectColumnExpr(columns, "website", "NULL::text"),
    selectColumnExpr(columns, "logoURL", "NULL::text"),
    selectColumnExpr(columns, "principalName", "NULL::text"),
    selectColumnExpr(columns, "primaryColor", "'#1a73e8'::text"),
    selectColumnExpr(columns, "secondaryColor", "'#4285f4'::text"),
    selectColumnExpr(columns, "subscriptionPlan", "'free'::text"),
    selectColumnExpr(columns, "subscriptionStatus", "'trial'::text"),
    selectColumnExpr(columns, "subscriptionStartDate", "NULL::timestamptz"),
    selectColumnExpr(columns, "subscriptionEndDate", "NULL::timestamptz"),
    selectColumnExpr(columns, "maxStudents", "0::int"),
    selectColumnExpr(columns, "maxTeachers", "0::int"),
    selectColumnExpr(columns, "maxStorage", "0::int"),
    selectColumnExpr(columns, "currentStudents", "0::int"),
    selectColumnExpr(columns, "currentTeachers", "0::int"),
    selectColumnExpr(columns, "currentStorage", "0::int"),
    selectColumnExpr(columns, "timezone", "'Asia/Kolkata'::text"),
    selectColumnExpr(columns, "currency", "'INR'::text"),
    selectColumnExpr(columns, "dateFormat", "'DD/MM/YYYY'::text"),
    selectColumnExpr(columns, "currentSession", "NULL::text"),
    selectColumnExpr(columns, "isActive", "true"),
    selectColumnExpr(columns, "createdAt", "now()"),
    selectColumnExpr(columns, "updatedAt", "now()"),
  ];

  const query = `
    SELECT ${selectColumns.join(", ")}
    FROM "School"
    WHERE "id" = $1
    LIMIT 1
  `;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(query, schoolId);
  if (rows.length === 0) return null;

  return mapSchoolRow(rows[0]);
}

async function getPlatformStatsCompatibility() {
  const columns = await getSchoolTableColumns();
  const hasIsActive = columns.has("isActive");
  const hasSubscriptionStatus = columns.has("subscriptionStatus");
  const hasSubscriptionPlan = columns.has("subscriptionPlan");
  const hasCurrentStudents = columns.has("currentStudents");
  const hasCurrentTeachers = columns.has("currentTeachers");

  const activeExpr = hasSubscriptionStatus
    ? `SUM(CASE WHEN ${hasIsActive ? `"isActive" = true AND ` : ""}"subscriptionStatus" = 'active' THEN 1 ELSE 0 END)::bigint`
    : hasIsActive
      ? `SUM(CASE WHEN "isActive" = true THEN 1 ELSE 0 END)::bigint`
      : `0::bigint`;

  const trialExpr = hasSubscriptionStatus
    ? `SUM(CASE WHEN ${hasIsActive ? `"isActive" = true AND ` : ""}"subscriptionStatus" = 'trial' THEN 1 ELSE 0 END)::bigint`
    : `0::bigint`;

  const expiredExpr = hasSubscriptionStatus
    ? `SUM(CASE WHEN ${hasIsActive ? `"isActive" = true AND ` : ""}"subscriptionStatus" = 'expired' THEN 1 ELSE 0 END)::bigint`
    : `0::bigint`;

  const sumStudentsExpr = hasCurrentStudents
    ? `COALESCE(SUM("currentStudents"), 0)::bigint`
    : `0::bigint`;

  const sumTeachersExpr = hasCurrentTeachers
    ? `COALESCE(SUM("currentTeachers"), 0)::bigint`
    : `0::bigint`;

  const statsQuery = `
    SELECT
      COUNT(*)::bigint AS "totalSchools",
      ${activeExpr} AS "activeSchools",
      ${trialExpr} AS "trialSchools",
      ${expiredExpr} AS "expiredSchools",
      ${sumStudentsExpr} AS "totalStudents",
      ${sumTeachersExpr} AS "totalTeachers"
    FROM "School"
  `;

  const [statsRow] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(statsQuery);

  let planDistribution: Record<string, number> = {};
  if (hasSubscriptionPlan) {
    const plans = await prisma.$queryRawUnsafe<Array<{ plan: string | null; count: number | bigint | string }>>(`
      SELECT "subscriptionPlan"::text AS "plan", COUNT(*)::bigint AS "count"
      FROM "School"
      GROUP BY "subscriptionPlan"
    `);

    planDistribution = Object.fromEntries(
      plans
        .filter((item) => typeof item.plan === "string" && item.plan.trim().length > 0)
        .map((item) => [String(item.plan), toNumber(item.count)])
    );
  }

  return {
    totalSchools: toNumber(statsRow?.totalSchools),
    activeSchools: toNumber(statsRow?.activeSchools),
    trialSchools: toNumber(statsRow?.trialSchools),
    expiredSchools: toNumber(statsRow?.expiredSchools),
    totalStudents: toNumber(statsRow?.totalStudents),
    totalTeachers: toNumber(statsRow?.totalTeachers),
    planDistribution,
  };
}

export interface AdminCredentials {
  email: string;
  password: string;
  displayName: string;
  uid: string;
}

function generateSchoolCode(name: string): string {
  const prefix = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function defaultSchoolSummaryCardConfig(): Record<string, unknown> {
  return {
    enabled: true,
    title: "Today's Summary",
    items: {
      classesToday: {
        enabled: true,
        label: "Classes",
        icon: "book-open-variant",
        color: "#4C6EF5",
        route: "/teacher/schedule",
      },
      classesCompleted: {
        enabled: true,
        label: "Completed",
        icon: "check-circle",
        color: "#10B981",
        route: "/teacher/schedule",
      },
      totalStudents: {
        enabled: true,
        label: "Students",
        icon: "account-group",
        color: "#F59E0B",
        route: "/teacher/attendance",
      },
    },
  };
}

export async function createSchool(
  data: CreateSchoolInput,
  performedBy: string
) {
  const code = data.code || generateSchoolCode(data.name);

  // Check for duplicate code
  const existing = await prisma.school.findUnique({ where: { code } });
  if (existing) throw Errors.alreadyExists("School", code);

  // Default trial end: 14 days
  const trialEnd =
    data.trialEndDate ??
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const trialEndDate = new Date(`${trialEnd}T00:00:00.000Z`);
  // Phase 4 bootstrap: every newly onboarded school starts on FREE plan.
  const initialPlan = normalizeTenantPlan("free");
  const initialStatus = "trial";
  const subscriptionStartDate = parseOptionalDate(data.subscriptionStartDate) ?? new Date();
  const explicitSubscriptionEndDate = parseOptionalDate(data.subscriptionEndDate);
  const subscriptionEndDate =
    explicitSubscriptionEndDate ?? (initialStatus === "trial" ? trialEndDate : undefined);

  const maxStudents = resolveStudentLimitForPlan(initialPlan, data.maxStudents);
  const maxTeachers = resolveTeacherLimitForPlan(initialPlan, data.maxTeachers);

  const school = await prisma.$transaction(async (tx) => {
    const createdSchool = await tx.school.create({
      data: {
        name: data.name,
        code,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        phone: data.phone,
        email: data.email,
        website: data.website,
        principalName: data.principalName,
        logoURL: data.logoURL,
        primaryColor: data.primaryColor ?? "#1a73e8",
        secondaryColor: data.secondaryColor ?? "#4285f4",
        subscriptionPlan: initialPlan,
        subscriptionStatus: initialStatus,
        subscriptionStartDate,
        subscriptionEndDate,
        trialEndDate: trialEnd,
        maxStudents,
        maxTeachers,
        maxStorage: data.maxStorage ?? 1024,
        timezone: data.timezone ?? "Asia/Kolkata",
        currency: data.currency ?? "INR",
        dateFormat: data.dateFormat ?? "DD/MM/YYYY",
        currentSession: data.currentSession,
        isActive: true,
        createdBy: performedBy,
      },
    });

    await tx.subscription.create({
      data: {
        schoolId: createdSchool.id,
        plan: initialPlan,
        status: initialStatus,
        billingCycle: "monthly",
        startDate: subscriptionStartDate,
        endDate: subscriptionEndDate,
        trialEndDate: initialStatus === "trial" ? trialEndDate : null,
        autoRenew: createdSchool.autoRenew,
        amount: 0,
        currency: createdSchool.currency,
      },
    });

    await tx.schoolConfig.create({
      data: {
        schoolId: createdSchool.id,
        summaryCard: defaultSchoolSummaryCardConfig(),
        metadata: {
          subscriptionBootstrap: {
            plan: initialPlan,
            limits: { maxStudents, maxTeachers },
          },
        },
      },
    });

    return createdSchool;
  });

  await writeAuditLog("CREATE_SCHOOL", performedBy, school.id, {
    schoolName: school.name,
    schoolCode: school.code,
    plan: school.subscriptionPlan,
  });

  // Auto-create admin user
  let adminCredentials: AdminCredentials | undefined;
  if (data.adminEmail) {
    const adminPassword = data.adminPassword || crypto.randomBytes(9).toString("base64url");
    const adminName = data.adminDisplayName || `${data.name} Admin`;

    try {
      const userRecord = await auth.createUser({
        email: data.adminEmail,
        password: adminPassword,
        displayName: adminName,
      });

      await auth.setCustomUserClaims(userRecord.uid, {
        role: "Admin",
        schoolId: school.id,
      });

      await prisma.user.create({
        data: {
          uid: userRecord.uid,
          email: data.adminEmail,
          displayName: adminName,
          role: "Admin",
          schoolId: school.id,
          isActive: true,
        },
      });

      adminCredentials = {
        email: data.adminEmail,
        password: adminPassword,
        displayName: adminName,
        uid: userRecord.uid,
      };

      await writeAuditLog("CREATE_ADMIN", performedBy, school.id, {
        adminUid: userRecord.uid,
        adminEmail: data.adminEmail,
      });
    } catch (err: any) {
      log.error({ err }, "Failed to auto-create admin user");
    }
  }

  return { ...school, adminCredentials };
}

export async function getSchools(
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { status?: string; plan?: string; search?: string } = {}
) {
  const where: any = { isActive: true };
  if (filters.status) where.subscriptionStatus = filters.status;
  if (filters.plan) where.subscriptionPlan = filters.plan;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { code: { contains: filters.search, mode: "insensitive" } },
      { city: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const limit = Math.min(pagination.limit ?? 20, 100);

  try {
    const schools = await prisma.school.findMany({
      where,
      orderBy: { [pagination.sortBy ?? "createdAt"]: pagination.sortOrder ?? "desc" },
      take: limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
    });

    const hasMore = schools.length > limit;
    const data = hasMore ? schools.slice(0, limit) : schools;

    return {
      data,
      pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
    };
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }

    log.warn({ err: error }, "Falling back to compatibility school-list query");
    return getSchoolsCompatibility(pagination, filters);
  }
}

export async function getSchoolById(schoolId: string) {
  assertSchoolScope(schoolId);
  try {
    return await prisma.school.findUnique({ where: { id: schoolId } });
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }

    log.warn({ err: error, schoolId }, "Falling back to compatibility school-by-id query");
    return getSchoolByIdCompatibility(schoolId);
  }
}

export async function updateSchool(
  schoolId: string,
  data: UpdateSchoolAdminInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!existing) throw Errors.notFound("School", schoolId);

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: data as any,
  });

  await writeAuditLog("UPDATE_SCHOOL", performedBy, schoolId, {
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteSchool(
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school || !school.isActive) return false;

  await prisma.school.update({
    where: { id: schoolId },
    data: { isActive: false },
  });

  await writeAuditLog("DELETE_SCHOOL", performedBy, schoolId, {
    schoolName: school.name,
  });

  return true;
}

export async function changePlan(
  schoolId: string,
  plan: string,
  limits: { maxStudents: number; maxTeachers: number; maxStorage: number },
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!existing) throw Errors.notFound("School", schoolId);

  const normalizedPlan = normalizeTenantPlan(plan);
  const maxStudents = resolveStudentLimitForPlan(normalizedPlan, limits.maxStudents);
  const maxTeachers = resolveTeacherLimitForPlan(normalizedPlan, limits.maxTeachers);

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: {
      subscriptionPlan: normalizedPlan,
      maxStudents,
      maxTeachers,
      maxStorage: limits.maxStorage,
    },
  });

  await writeAuditLog("CHANGE_PLAN", performedBy, schoolId, { newPlan: plan, limits });

  return updated;
}

/**
 * Platform-wide statistics for super admin dashboard.
 */
export async function getPlatformStats() {
  try {
    const [
      totalSchools,
      activeSchools,
      trialSchools,
      expiredSchools,
      planCounts,
      studentTeacherCounts,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { isActive: true, subscriptionStatus: "active" } }),
      prisma.school.count({ where: { isActive: true, subscriptionStatus: "trial" } }),
      prisma.school.count({ where: { isActive: true, subscriptionStatus: "expired" } }),
      prisma.school.groupBy({
        by: ["subscriptionPlan"],
        _count: true,
      }),
      prisma.school.aggregate({
        _sum: { currentStudents: true, currentTeachers: true },
      }),
    ]);

    const planDistribution = Object.fromEntries(
      planCounts.map((p) => [p.subscriptionPlan, p._count])
    );

    return {
      totalSchools,
      activeSchools,
      trialSchools,
      expiredSchools,
      totalStudents: studentTeacherCounts._sum.currentStudents ?? 0,
      totalTeachers: studentTeacherCounts._sum.currentTeachers ?? 0,
      planDistribution,
    };
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) {
      throw error;
    }

    log.warn({ err: error }, "Falling back to compatibility platform-stats query");
    return getPlatformStatsCompatibility();
  }
}
