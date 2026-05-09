import { prisma } from "../lib/prisma";
import { admin, auth } from "../lib/firebase-admin";
import type { CreateUserInput, UpdateUserInput } from "../schemas/admin.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";

const SUPERADMIN_ROLE = "SuperAdmin";

function assertNotSuperAdminRole(role?: string): void {
  if (role === SUPERADMIN_ROLE) {
    throw Errors.badRequest("SuperAdmin role cannot be managed from school-scoped endpoints");
  }
}

function assertUserNotSuperAdmin(existingRole: string): void {
  if (existingRole === SUPERADMIN_ROLE) {
    throw Errors.badRequest("SuperAdmin users cannot be managed from school-scoped endpoints");
  }
}

export async function createUser(
  schoolId: string,
  data: CreateUserInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);
  assertNotSuperAdminRole(data.role);

  // 1. Create Firebase Auth user
  let firebaseUser: admin.auth.UserRecord;
  try {
    firebaseUser = await auth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      phoneNumber: data.phone,
      photoURL: data.photoURL,
    });
  } catch (err: unknown) {
    const fbErr = err as { code?: string; message?: string };
    if (fbErr.code === "auth/email-already-exists") {
      throw Errors.alreadyExists("User", data.email);
    }
    throw Errors.internal(fbErr.message ?? "Failed to create Firebase Auth user");
  }

  // 2. Set custom claims
  await auth.setCustomUserClaims(firebaseUser.uid, { role: data.role, schoolId });

  // 3. Create Prisma user record
  const user = await prisma.user.create({
    data: {
      uid: firebaseUser.uid,
      email: data.email,
      displayName: data.displayName,
      role: data.role as any,
      phone: data.phone,
      photoURL: data.photoURL,
      schoolId,
      isActive: data.isActive,
    },
  });

  await writeAuditLog("CREATE_USER", performedBy, schoolId, {
    userId: firebaseUser.uid,
    email: data.email,
    role: data.role,
  });

  return user;
}

export async function getUsersBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string },
  filters: { role?: string; status?: string } = {}
) {
  assertSchoolScope(schoolId);

  const where: any = { schoolId };
  if (filters.role) where.role = filters.role;
  if (filters.status) where.isActive = filters.status === "active";

  const limit = Math.min(pagination.limit ?? 20, 100);

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = users.length > limit;
  const data = hasMore ? users.slice(0, limit) : users;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getUserById(uid: string, schoolId: string) {
  assertSchoolScope(schoolId);

  return prisma.user.findFirst({
    where: { uid, schoolId },
  });
}

export async function updateUser(
  uid: string,
  schoolId: string,
  data: UpdateUserInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);
  assertNotSuperAdminRole(data.role);

  const existing = await prisma.user.findFirst({ where: { uid, schoolId } });
  if (!existing) throw Errors.notFound("User", uid);
  assertUserNotSuperAdmin(existing.role);

  // Update Firebase Auth if relevant fields changed
  const authUpdates: admin.auth.UpdateRequest = {};
  if (data.displayName) authUpdates.displayName = data.displayName;
  if (data.phone) authUpdates.phoneNumber = data.phone;
  if (data.photoURL) authUpdates.photoURL = data.photoURL;
  if (data.isActive !== undefined) authUpdates.disabled = !data.isActive;

  if (Object.keys(authUpdates).length > 0) {
    await auth.updateUser(uid, authUpdates);
  }

  // Update custom claims if role changed
  if (data.role && data.role !== existing.role) {
    await auth.setCustomUserClaims(uid, { role: data.role, schoolId });
  }

  // Explicit field mapping — never spread raw input into Prisma
  const safeUpdate: Record<string, unknown> = {};
  if (data.displayName !== undefined) safeUpdate.displayName = data.displayName;
  if (data.role !== undefined) safeUpdate.role = data.role;
  if (data.phone !== undefined) safeUpdate.phone = data.phone;
  if (data.photoURL !== undefined) safeUpdate.photoURL = data.photoURL;
  if (data.isActive !== undefined) safeUpdate.isActive = data.isActive;

  const result = await prisma.user.updateMany({
    where: { uid, schoolId },
    data: safeUpdate,
  });

  if (result.count === 0) {
    throw Errors.notFound("User", uid);
  }

  const updated = await prisma.user.findFirst({ where: { uid, schoolId } });
  if (!updated) {
    throw Errors.notFound("User", uid);
  }

  await writeAuditLog("UPDATE_USER", performedBy, schoolId, {
    userId: uid,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function deactivateUser(
  uid: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const user = await prisma.user.findFirst({ where: { uid, schoolId } });
  if (!user) return false;
  assertUserNotSuperAdmin(user.role);

  await auth.updateUser(uid, { disabled: true });

  const result = await prisma.user.updateMany({
    where: { uid, schoolId },
    data: { isActive: false },
  });

  if (result.count === 0) return false;

  await writeAuditLog("DELETE_USER", performedBy, schoolId, {
    userId: uid,
    email: user.email,
  });

  return true;
}
