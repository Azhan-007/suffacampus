import { prisma } from "../lib/prisma";
import { createNotification } from "./notification.service";

export interface OverdueFeeNotificationResult {
  overdueFees: number;
  notificationsCreated: number;
  skippedDuplicates: number;
  failed: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function processOverdueFeeNotifications(
  runDate = new Date()
): Promise<OverdueFeeNotificationResult> {
  const today = toIsoDate(runDate);
  let notificationsCreated = 0;
  let skippedDuplicates = 0;
  let failed = 0;

  const overdueFees = await prisma.fee.findMany({
    where: {
      dueDate: { lt: today },
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
      const message = `Fee of ₹${fee.amount} for ${studentName} is overdue since ${fee.dueDate}`;
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

  return {
    overdueFees: overdueFees.length,
    notificationsCreated,
    skippedDuplicates,
    failed,
  };
}
