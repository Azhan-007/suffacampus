import { prisma } from "../lib/prisma";
import { auth } from "../lib/firebase-admin";
import type { CreateSchoolInput, UpdateSchoolAdminInput } from "../schemas/admin.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import crypto from "crypto";

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
  const initialPlan = (data.subscriptionPlan as any) ?? "free";
  const initialStatus = (data.subscriptionStatus as any) ?? "trial";
  const subscriptionStartDate = parseOptionalDate(data.subscriptionStartDate) ?? new Date();
  const explicitSubscriptionEndDate = parseOptionalDate(data.subscriptionEndDate);
  const subscriptionEndDate =
    explicitSubscriptionEndDate ?? (initialStatus === "trial" ? trialEndDate : undefined);

  const school = await prisma.school.create({
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
      maxStudents: data.maxStudents ?? 50,
      maxTeachers: data.maxTeachers ?? 10,
      maxStorage: data.maxStorage ?? 500,
      timezone: data.timezone ?? "Asia/Kolkata",
      currency: data.currency ?? "INR",
      dateFormat: data.dateFormat ?? "DD/MM/YYYY",
      currentSession: data.currentSession,
      isActive: true,
      createdBy: performedBy,
    },
  });

  await prisma.subscription.create({
    data: {
      schoolId: school.id,
      plan: initialPlan,
      status: initialStatus,
      billingCycle: "monthly",
      startDate: subscriptionStartDate,
      endDate: subscriptionEndDate,
      trialEndDate: initialStatus === "trial" ? trialEndDate : null,
      autoRenew: school.autoRenew,
      amount: 0,
      currency: school.currency,
    },
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
      console.error("Failed to auto-create admin user:", err.message);
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
}

export async function getSchoolById(schoolId: string) {
  return prisma.school.findUnique({ where: { id: schoolId } });
}

export async function updateSchool(
  schoolId: string,
  data: UpdateSchoolAdminInput,
  performedBy: string
) {
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
  const existing = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!existing) throw Errors.notFound("School", schoolId);

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: {
      subscriptionPlan: plan as any,
      maxStudents: limits.maxStudents,
      maxTeachers: limits.maxTeachers,
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
}
