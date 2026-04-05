import { prisma } from "../lib/prisma";
import { admin, auth } from "../lib/firebase-admin";
import type { CreateUserInput, UpdateUserInput } from "../schemas/admin.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

export async function createUser(
  schoolId: string,
  data: CreateUserInput,
  performedBy: string
) {
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
  const user = await prisma.user.findUnique({ where: { uid } });
  if (!user || user.schoolId !== schoolId) return null;
  return user;
}

export async function updateUser(
  uid: string,
  schoolId: string,
  data: UpdateUserInput,
  performedBy: string
) {
  const existing = await prisma.user.findUnique({ where: { uid } });
  if (!existing) throw Errors.notFound("User", uid);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();

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

  const updated = await prisma.user.update({
    where: { uid },
    data: { ...data, role: data.role as any },
  });

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
  const user = await prisma.user.findUnique({ where: { uid } });
  if (!user || user.schoolId !== schoolId) return false;

  await auth.updateUser(uid, { disabled: true });

  await prisma.user.update({
    where: { uid },
    data: { isActive: false },
  });

  await writeAuditLog("DELETE_USER", performedBy, schoolId, {
    userId: uid,
    email: user.email,
  });

  return true;
}
