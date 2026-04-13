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

  const updateData: Record<string, unknown> = {
    ...data,
    status: data.status as any,
  };

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
  return true;
}

/** Fee statistics for dashboard / reports — uses Prisma aggregations */
export async function getFeeStats(schoolId: string) {
  assertSchoolScope(schoolId);

  const fees = await prisma.fee.findMany({
    where: { schoolId },
    select: {
      status: true,
      amount: true,
      amountPaid: true,
    },
  });

  const zeroMoney = moneyFrom(null, 0);
  const statusMap: Record<string, { count: number; sum: ReturnType<typeof moneyFrom>; paid: ReturnType<typeof moneyFrom> }> = {};
  let totalFeesMoney = zeroMoney;

  for (const fee of fees) {
    const amountMoney = moneyFrom(fee.amount);
    const paidMoney = moneyFrom(fee.amountPaid);

    totalFeesMoney = totalFeesMoney.plus(amountMoney);

    if (!statusMap[fee.status]) {
      statusMap[fee.status] = { count: 0, sum: zeroMoney, paid: zeroMoney };
    }

    statusMap[fee.status].count += 1;
    statusMap[fee.status].sum = statusMap[fee.status].sum.plus(amountMoney);
    statusMap[fee.status].paid = statusMap[fee.status].paid.plus(paidMoney);
  }

  const collectedAmountMoney = (statusMap.Paid?.sum ?? zeroMoney).plus(statusMap.Partial?.paid ?? zeroMoney);
  const pendingAmountMoney = (statusMap.Pending?.sum ?? zeroMoney).plus(statusMap.Overdue?.sum ?? zeroMoney);

  return {
    totalFees: moneyToNumber(totalFeesMoney),
    collectedAmount: moneyToNumber(collectedAmountMoney),
    pendingAmount: moneyToNumber(pendingAmountMoney),
    totalRecords: fees.length,
    paidCount: statusMap.Paid?.count ?? 0,
    pendingCount: statusMap.Pending?.count ?? 0,
    overdueCount: statusMap.Overdue?.count ?? 0,
    partialCount: statusMap.Partial?.count ?? 0,
  };
}
