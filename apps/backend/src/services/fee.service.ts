import { prisma } from "../lib/prisma";
import type { CreateFeeInput, UpdateFeeInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { createNotification } from "./notification.service";
import { Errors } from "../errors";
import {
  dateTimeFrom,
  formatMoneyInr,
  moneyFrom,
  moneyFromInput,
  moneyToNumber,
} from "../utils/safe-fields";
import { Permission, PermissionService } from "./permission.service";
import { createLogger } from "../utils/logger";
import { assertSchoolScope } from "../lib/tenant-scope";
import { cacheDel } from "../lib/cache";

const log = createLogger("fee-service");

interface ServiceActorContext {
  role?: string | null;
  schoolId?: string | null;
}

function assertServicePermission(
  actor: ServiceActorContext | undefined,
  permission: Permission
): void {
  if (!actor) {
    return;
  }

  PermissionService.requirePermission(permission)({
    role: actor.role,
    schoolId: actor.schoolId,
  });
}

async function writeFeeAuditLogSafe(
  action: string,
  userId: string,
  schoolId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  assertSchoolScope(schoolId);

  try {
    await writeAuditLog(action, userId, schoolId, metadata);
  } catch (error) {
    log.error({ err: error, action, userId, schoolId }, "Failed to write fee audit log");
  }
}

export async function createFee(
  schoolId: string,
  data: CreateFeeInput,
  performedBy: string,
  actor?: ServiceActorContext
) {
  assertSchoolScope(schoolId);
  assertServicePermission(actor, Permission.FEE_CREATE);

  const amount = moneyFromInput(data.amount);
  const amountPaid = moneyFromInput(data.amountPaid ?? 0);
  const dueDate = dateTimeFrom(data.dueDate);
  const paidDate = dateTimeFrom(data.paidDate ?? null);

  if (!dueDate) {
    throw Errors.badRequest("Invalid due date format");
  }

  if (data.paidDate && !paidDate) {
    throw Errors.badRequest("Invalid paid date format");
  }

  const fee = await prisma.fee.create({
    data: {
      schoolId,
      studentId: data.studentId,
      studentName: data.studentName,
      classId: data.classId,
      sectionId: data.sectionId,
      amount,
      dueDate,
      paidDate: paidDate ?? undefined,
      status: (data.status as any) ?? "Pending",
      paymentMode: data.paymentMode,
      transactionId: data.transactionId,
      feeType: data.feeType,
      amountPaid,
      remarks: data.remarks,
    },
  });

  await writeFeeAuditLogSafe("FEE_CREATED", performedBy, schoolId, {
    feeId: fee.id,
    studentId: fee.studentId,
    amount: moneyToNumber(fee.amount),
    feeType: fee.feeType,
  });

  try {
    const parents = await prisma.user.findMany({
      where: {
        schoolId,
        role: "Parent" as any,
        isActive: true,
        studentIds: { has: fee.studentId },
      },
      select: { uid: true },
    });

    if (parents.length > 0) {
      const actor = await prisma.user.findFirst({
        where: { uid: performedBy, schoolId },
        select: { role: true },
      });

      if (!actor?.role) {
        return fee;
      }

      const studentName = fee.studentName?.trim() || "student";
      const message = `Fee of ₹${formatMoneyInr(fee.amount)} assigned for ${studentName}`;

      for (const parent of parents) {
        const duplicate = await prisma.notification.findFirst({
          where: {
            schoolId,
            type: "REMINDER" as any,
            targetType: "USER" as any,
            targetId: parent.uid,
            referenceType: "FEE",
            referenceId: fee.id,
          },
          select: { id: true },
        });

        if (duplicate) continue;

        try {
          await createNotification(
            {
              title: "Fee Assigned",
              message,
              type: "REMINDER",
              targetType: "USER",
              targetId: parent.uid,
              referenceType: "FEE",
              referenceId: fee.id,
            },
            {
              userId: performedBy,
              schoolId,
              role: actor.role,
            }
          );
        } catch {
          // Continue notifying other parents even if one send fails.
        }
      }
    }
  } catch {
    // Keep fee creation non-blocking if notification side-effect fails.
  }

  // Invalidate dashboard cache so fee totals reflect the new record
  void cacheDel(`dashboard:stats:${schoolId}`);
  return fee;
}

export async function getFeesBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { studentId?: string; classId?: string; status?: string; feeType?: string } = {}
) {
  assertSchoolScope(schoolId);

  const where: any = { schoolId };
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.classId) where.classId = filters.classId;
  if (filters.status) where.status = filters.status;
  if (filters.feeType) where.feeType = filters.feeType;

  const limit = Math.min(pagination.limit ?? 20, 100);

  const fees = await prisma.fee.findMany({
    where,
    orderBy: { [pagination.sortBy ?? "createdAt"]: pagination.sortOrder ?? "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = fees.length > limit;
  const data = hasMore ? fees.slice(0, limit) : fees;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getFeeById(feeId: string, schoolId: string) {
  assertSchoolScope(schoolId);

  const fee = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!fee || fee.schoolId !== schoolId) return null;
  return fee;
}

export async function updateFee(
  feeId: string,
  schoolId: string,
  data: UpdateFeeInput,
  performedBy: string,
  actor?: ServiceActorContext
) {
  assertSchoolScope(schoolId);
  assertServicePermission(actor, Permission.FEE_UPDATE);

  const existing = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!existing) throw Errors.notFound("Fee", feeId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();

  // Explicit field mapping — never spread raw input into Prisma
  const updateData: Record<string, unknown> = {};
  if (data.studentId !== undefined) updateData.studentId = data.studentId;
  if (data.studentName !== undefined) updateData.studentName = data.studentName;
  if (data.classId !== undefined) updateData.classId = data.classId;
  if (data.sectionId !== undefined) updateData.sectionId = data.sectionId;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.paymentMode !== undefined) updateData.paymentMode = data.paymentMode;
  if (data.transactionId !== undefined) updateData.transactionId = data.transactionId;
  if (data.feeType !== undefined) updateData.feeType = data.feeType;
  if (data.remarks !== undefined) updateData.remarks = data.remarks;

  if (data.amount !== undefined) {
    updateData.amount = moneyFromInput(data.amount);
  }

  if (data.amountPaid !== undefined) {
    updateData.amountPaid = moneyFromInput(data.amountPaid);
  }

  if (data.dueDate !== undefined) {
    const dueDate = dateTimeFrom(data.dueDate);
    if (!dueDate) {
      throw Errors.badRequest("Invalid due date format");
    }

    updateData.dueDate = dueDate;
  }

  if (data.paidDate !== undefined) {
    const paidDate = dateTimeFrom(data.paidDate ?? null);
    if (data.paidDate && !paidDate) {
      throw Errors.badRequest("Invalid paid date format");
    }

    updateData.paidDate = paidDate;
  }

  const updated = await prisma.fee.update({
    where: { id: feeId },
    data: updateData,
  });

  await writeFeeAuditLogSafe("FEE_UPDATED", performedBy, schoolId, {
    feeId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteFee(
  feeId: string,
  schoolId: string,
  performedBy: string,
  actor?: ServiceActorContext
): Promise<boolean> {
  assertSchoolScope(schoolId);
  assertServicePermission(actor, Permission.FEE_DELETE);

  const existing = await prisma.fee.findUnique({ where: { id: feeId } });
  if (!existing || existing.schoolId !== schoolId) return false;

  await prisma.fee.delete({ where: { id: feeId } });

  await writeFeeAuditLogSafe("FEE_DELETED", performedBy, schoolId, {
    feeId,
    studentId: existing.studentId,
  });
  // Invalidate dashboard cache so fee totals reflect the deletion
  void cacheDel(`dashboard:stats:${schoolId}`);
  return true;
}

/** Fee statistics for dashboard / reports — uses Prisma aggregations */
export async function getFeeStats(schoolId: string) {
  assertSchoolScope(schoolId);

  const [statusGroups, totals] = await Promise.all([
    prisma.fee.groupBy({
      by: ["status"],
      where: { schoolId },
      _count: true,
      _sum: { amount: true, amountPaid: true },
    }),
    prisma.fee.aggregate({
      where: { schoolId },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const totalFees = moneyToNumber(moneyFrom(totals._sum.amount));

  let collectedAmountMoney = moneyFrom(null, 0);
  let pendingAmountMoney = moneyFrom(null, 0);
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let partialCount = 0;

  for (const group of statusGroups) {
    const sumMoney = moneyFrom(group._sum.amount);
    const paidMoney = moneyFrom(group._sum.amountPaid);

    switch (group.status) {
      case "Paid":
        paidCount = group._count;
        collectedAmountMoney = collectedAmountMoney.plus(sumMoney);
        break;
      case "Partial":
        partialCount = group._count;
        collectedAmountMoney = collectedAmountMoney.plus(paidMoney);
        break;
      case "Pending":
        pendingCount = group._count;
        pendingAmountMoney = pendingAmountMoney.plus(sumMoney);
        break;
      case "Overdue":
        overdueCount = group._count;
        pendingAmountMoney = pendingAmountMoney.plus(sumMoney);
        break;
    }
  }

  return {
    totalFees,
    collectedAmount: moneyToNumber(collectedAmountMoney),
    pendingAmount: moneyToNumber(pendingAmountMoney),
    totalRecords: totals._count,
    paidCount,
    pendingCount,
    overdueCount,
    partialCount,
  };
}
