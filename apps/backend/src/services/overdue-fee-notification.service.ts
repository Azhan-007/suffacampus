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

const OVERDUE_BATCH_SIZE = 200;

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

    // Pre-load all parents for this school (bounded per school)
    const allParents = await prisma.user.findMany({
      where: {
        schoolId: school.id,
        role: "Parent" as any,
        isActive: true,
      },
      select: { uid: true, studentIds: true },
    });

    // Build studentId → parent UIDs map
    const parentsByStudentId = new Map<string, string[]>();
    for (const parent of allParents) {
      const studentIds = Array.isArray(parent.studentIds)
        ? (parent.studentIds as string[])
        : [];
      for (const sid of studentIds) {
        const list = parentsByStudentId.get(sid) ?? [];
        list.push(parent.uid);
        parentsByStudentId.set(sid, list);
      }
    }

    // Pre-load today's existing notification referenceIds to skip duplicates
    const existingNotifications = await prisma.notification.findMany({
      where: {
        schoolId: school.id,
        type: "REMINDER" as any,
        referenceType: "FEE",
        referenceId: { startsWith: "" }, // all referenceIds
        createdAt: { gte: dayStartUtc },
      },
      select: { referenceId: true, targetId: true },
    });

    const existingRefs = new Set(
      existingNotifications.map((n) => `${n.referenceId}::${n.targetId}`)
    );

    // Process overdue fees in cursor-based batches
    let cursor: string | undefined;

    while (true) {
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
        orderBy: { id: "asc" },
        take: OVERDUE_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (overdueFees.length === 0) break;
      overdueFeeCount += overdueFees.length;

      for (const fee of overdueFees) {
        try {
          const parentUids = parentsByStudentId.get(fee.studentId);
          if (!parentUids || parentUids.length === 0) continue;

          const studentName = fee.studentName?.trim() || "student";
          const dueDateLabel = dateOnlyStringFrom(fee.dueDate);
          const message = `Fee of ₹${formatMoneyInr(fee.amount)} for ${studentName} is overdue since ${dueDateLabel}`;
          const referenceId = `${fee.id}:${today}`;

          for (const parentUid of parentUids) {
            const dedupKey = `${referenceId}::${parentUid}`;
            if (existingRefs.has(dedupKey)) {
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
                  targetId: parentUid,
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
              existingRefs.add(dedupKey); // prevent re-processing within same run
            } catch {
              failed++;
            }
          }
        } catch {
          // Continue processing remaining fees if one fee path fails.
          failed++;
        }
      }

      cursor = overdueFees[overdueFees.length - 1].id;
      if (overdueFees.length < OVERDUE_BATCH_SIZE) break;
    }
  }

  return {
    overdueFees: overdueFeeCount,
    notificationsCreated,
    skippedDuplicates,
    failed,
  };
}
