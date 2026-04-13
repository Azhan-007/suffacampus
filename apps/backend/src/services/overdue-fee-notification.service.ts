import { prisma } from "../lib/prisma";
import { createNotification } from "./notification.service";
import {
  dateOnlyStringFrom,
  formatMoneyInr,
  startOfUtcDay,
} from "../utils/safe-fields";
import { assertSchoolScope } from "../lib/tenant-scope";

export interface OverdueFeeNotificationResult {
  overdueFees: number;
  notificationsCreated: number;
  skippedDuplicates: number;
  failed: number;
}

export async function processOverdueFeeNotifications(
  runDate = new Date()
): Promise<OverdueFeeNotificationResult> {
  const dayStartUtc = startOfUtcDay(runDate);
  const today = dayStartUtc.toISOString().split("T")[0];
  let notificationsCreated = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  let overdueFeeCount = 0;

  const activeSchools = await prisma.school.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  for (const school of activeSchools) {
    assertSchoolScope(school.id);

    const overdueFees = await prisma.fee.findMany({
      where: {
        schoolId: school.id,
        dueDate: { lt: dayStartUtc },
        status: { in: ["Pending", "Partial", "Overdue"] as any },
      },
      select: {
        id: true,
        schoolId: true,
        studentId: true,
        studentName: true,
        amount: true,
        dueDate: true,
      },
    });

    overdueFeeCount += overdueFees.length;

    for (const fee of overdueFees) {
      try {
        const parents = await prisma.user.findMany({
          where: {
            schoolId: fee.schoolId,
            role: "Parent" as any,
            isActive: true,
            studentIds: { has: fee.studentId },
          },
          select: { uid: true },
        });

        if (parents.length === 0) {
          continue;
        }

        const studentName = fee.studentName?.trim() || "student";
        const dueDateLabel = dateOnlyStringFrom(fee.dueDate);
        const message = `Fee of ₹${formatMoneyInr(fee.amount)} for ${studentName} is overdue since ${dueDateLabel}`;
        const referenceId = `${fee.id}:${today}`;

        for (const parent of parents) {
          const duplicate = await prisma.notification.findFirst({
            where: {
              schoolId: fee.schoolId,
              type: "REMINDER" as any,
              targetType: "USER" as any,
              targetId: parent.uid,
              referenceType: "FEE",
              referenceId,
            },
            select: { id: true },
          });

          if (duplicate) {
            skippedDuplicates++;
            continue;
          }

          try {
            await createNotification(
              {
                title: "Fee Overdue Reminder",
                message,
                type: "REMINDER",
                targetType: "USER",
                targetId: parent.uid,
                referenceType: "FEE",
                referenceId,
              },
              {
                userId: "system",
                schoolId: fee.schoolId,
                role: "Admin",
              }
            );
            notificationsCreated++;
          } catch {
            failed++;
          }
        }
      } catch {
        // Continue processing remaining fees if one fee path fails.
        failed++;
      }
    }
  }

  return {
    overdueFees: overdueFeeCount,
    notificationsCreated,
    skippedDuplicates,
    failed,
  };
}
