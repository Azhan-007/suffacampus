import cron, { type ScheduledTask } from "node-cron";
import pino from "pino";
import {
  processExpiredTrials,
  processOverdueSubscriptions,
  processExpiredGrace,
} from "../services/subscription.service";
import { processOverdueFeeNotifications } from "../services/overdue-fee-notification.service";
import { prisma } from "../lib/prisma";
import { trackError } from "../services/error-tracking.service";
import {
  trialExpiringEmail,
  usageLimitWarningEmail,
} from "../services/email-templates";
import { enqueueEmail, initEmailQueue, shutdownEmailQueue } from "../services/email-queue.service";

const log = pino({ name: "workers" });

/**
 * Background workers that run on a schedule.
 *
 * All workers are idempotent and safe to run on multiple instances
 * (each transition uses PostgreSQL/Prisma atomic updates).
 *
 * Schedule (node-cron syntax):
 *   ┌──────── minute (0–59)
 *   │ ┌────── hour (0–23)
 *   │ │ ┌──── day of month (1–31)
 *   │ │ │ ┌── month (1–12)
 *   │ │ │ │ ┌ day of week (0–7, 0 or 7 = Sunday)
 *   │ │ │ │ │
 *   * * * * *
 */

let started = false;
const tasks: ScheduledTask[] = [];
let lastOverdueFeeRunDate: string | null = null;

export function startWorkers(): void {
  if (started) return;
  started = true;

  void initEmailQueue();

  log.info("[workers] Starting background workers...");

  // ── Trial Expiry Check ─────────────────────────────────────────────────
  // Every hour at minute 0
  tasks.push(cron.schedule("0 * * * *", async () => {
    try {
      const count = await processExpiredTrials();
      if (count > 0) {
        log.info(`[workers] Expired ${count} trial(s)`);
      }
    } catch (err) {
      log.error({ err }, "Trial expiry worker failed");
      trackError({ error: err, metadata: { context: "worker:trial-expiry" } });
    }
  }));

  // ── Overdue Subscriptions ──────────────────────────────────────────────
  // Every hour at minute 15
  tasks.push(cron.schedule("15 * * * *", async () => {
    try {
      const count = await processOverdueSubscriptions();
      if (count > 0) {
        log.info(`[workers] Moved ${count} subscription(s) to past_due`);
      }
    } catch (err) {
      log.error({ err }, "Overdue subscriptions worker failed");
      trackError({ error: err, metadata: { context: "worker:overdue-subscriptions" } });
    }
  }));

  // ── Grace Period Expiry ────────────────────────────────────────────────
  // Every hour at minute 30
  tasks.push(cron.schedule("30 * * * *", async () => {
    try {
      const count = await processExpiredGrace();
      if (count > 0) {
        log.info(`[workers] Expired ${count} past_due subscription(s) after grace period`);
      }
    } catch (err) {
      log.error({ err }, "Grace period expiry worker failed");
      trackError({ error: err, metadata: { context: "worker:grace-expiry" } });
    }
  }));

  // ── Daily Usage Snapshot ───────────────────────────────────────────────
  // Every day at 2:00 AM
  tasks.push(cron.schedule("0 2 * * *", async () => {
    try {
      await captureUsageSnapshots();
    } catch (err) {
      log.error({ err }, "Usage snapshot worker failed");
      trackError({ error: err, metadata: { context: "worker:usage-snapshot" } });
    }
  }));

  // ── Overdue Fee Notifications ─────────────────────────────────────────
  // Every day at 8:00 AM
  tasks.push(cron.schedule("0 8 * * *", async () => {
    const today = new Date().toISOString().split("T")[0];
    if (lastOverdueFeeRunDate === today) {
      log.info({ date: today }, "[workers] Skipped overdue fee notifications (already ran today)");
      return;
    }

    try {
      const result = await processOverdueFeeNotifications();
      lastOverdueFeeRunDate = today;
      log.info({
        date: today,
        processed: result.overdueFees,
        sent: result.notificationsCreated,
        skippedDuplicates: result.skippedDuplicates,
        failed: result.failed,
      }, "[workers] Overdue fee job completed");
    } catch (err) {
      log.error({ err }, "Overdue fee notification worker failed");
      trackError({ error: err, metadata: { context: "worker:overdue-fee-notifications" } });
    }
  }));

  // ── Trial Expiry Email Reminders ───────────────────────────────────────
  // Every day at 9:00 AM — send reminders at day 7 and day 12 of trial
  tasks.push(cron.schedule("0 9 * * *", async () => {
    try {
      await sendTrialExpiryReminders();
    } catch (err) {
      log.error({ err }, "Trial reminder worker failed");
      trackError({ error: err, metadata: { context: "worker:trial-reminders" } });
    }
  }));

  // ── Usage Limit Warnings ──────────────────────────────────────────────
  // Every day at 10:00 AM — warn schools nearing plan limits
  tasks.push(cron.schedule("0 10 * * *", async () => {
    try {
      await sendUsageLimitWarnings();
    } catch (err) {
      log.error({ err }, "Usage limit warning worker failed");
      trackError({ error: err, metadata: { context: "worker:usage-limits" } });
    }
  }));

  log.info("[workers] All background workers scheduled");
}

/** Stop all scheduled cron tasks (called during graceful shutdown). */
export function stopWorkers(): void {
  tasks.forEach((t) => t.stop());
  tasks.length = 0;
  void shutdownEmailQueue();
  started = false;
  log.info("[workers] All background workers stopped");
}

/**
 * Capture daily usage snapshots for all active schools.
 * Useful for usage analytics and limit enforcement history.
 */
async function captureUsageSnapshots(): Promise<void> {
  const activeSchools = await prisma.school.findMany({
    where: { isActive: true },
    select: {
      id: true,
      subscriptionPlan: true,
      maxStudents: true,
      maxTeachers: true,
      maxStorage: true,
      currentStorage: true,
    },
  });

  const snapshotDate = new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  // Re-run safe: overwrite the daily snapshot set.
  await prisma.usageRecord.deleteMany({
    where: {
      date: snapshotDate,
      period: "daily",
    },
  });

  let count = 0;

  for (const school of activeSchools) {
    const [studentCount, teacherCount, classCount] = await Promise.all([
      prisma.student.count({
        where: { schoolId: school.id, isDeleted: false },
      }),
      prisma.teacher.count({
        where: { schoolId: school.id, isDeleted: false },
      }),
      prisma.class.count({
        where: { schoolId: school.id, isActive: true },
      }),
    ]);

    await prisma.school.update({
      where: { id: school.id },
      data: {
        currentStudents: studentCount,
        currentTeachers: teacherCount,
      },
    });

    await prisma.usageRecord.create({
      data: {
        schoolId: school.id,
        date: snapshotDate,
        period: "daily",
        students: studentCount,
        teachers: teacherCount,
        classes: classCount,
        storage: school.currentStorage ?? 0,
      },
    });

    count++;
  }

  log.info(`Captured usage snapshots for ${count} school(s)`);
}

// ---------------------------------------------------------------------------
// Trial expiry email reminders
// ---------------------------------------------------------------------------

/**
 * Send email reminders to schools whose trial is about to expire.
 * Sends at 7 days remaining and 2 days remaining.
 */
async function sendTrialExpiryReminders(): Promise<void> {
  const today = new Date();

  // Check for trials expiring in 7 days and 2 days
  for (const daysAhead of [7, 2]) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetStr = targetDate.toISOString().split("T")[0];

    const schools = await prisma.school.findMany({
      where: {
        isActive: true,
        subscriptionStatus: "trial",
        trialEndDate: targetStr,
      },
      select: {
        name: true,
        email: true,
      },
    });

    for (const school of schools) {
      const schoolName = school.name ?? "Your School";
      const adminEmail = school.email;

      if (!adminEmail) continue;

      const template = trialExpiringEmail(schoolName, daysAhead);
      await enqueueEmail({
        to: adminEmail,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    }

    if (schools.length > 0) {
      log.info(`[workers] Sent ${schools.length} trial expiry reminder(s) (${daysAhead} days ahead)`);
    }
  }
}

// ---------------------------------------------------------------------------
// Usage limit warnings
// ---------------------------------------------------------------------------

/**
 * Warn schools that have used ≥ 80% of any plan limit.
 * Sends at most one warning per school per day.
 */
async function sendUsageLimitWarnings(): Promise<void> {
  const schools = await prisma.school.findMany({
    where: {
      isActive: true,
      subscriptionStatus: {
        in: ["active", "trial"],
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      maxStudents: true,
      maxTeachers: true,
    },
  });

  let sent = 0;

  for (const school of schools) {
    const schoolName = school.name ?? "School";
    const adminEmail = school.email;

    if (!adminEmail) continue;

    // Count current usage
    const [studentCount, teacherCount] = await Promise.all([
      prisma.student.count({
        where: {
          schoolId: school.id,
          isDeleted: false,
        },
      }),
      prisma.teacher.count({
        where: {
          schoolId: school.id,
          isDeleted: false,
        },
      }),
    ]);

    const checks = [
      { resource: "Students", current: studentCount, limit: school.maxStudents },
      { resource: "Teachers", current: teacherCount, limit: school.maxTeachers },
    ];

    for (const check of checks) {
      if (!check.limit || check.limit === -1) continue;

      const usage = check.current / check.limit;
      if (usage >= 0.8) {
        const template = usageLimitWarningEmail(
          schoolName,
          check.resource,
          check.current,
          check.limit
        );
        await enqueueEmail({
          to: adminEmail,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        sent++;
      }
    }
  }

  if (sent > 0) {
    log.info(`[workers] Sent ${sent} usage limit warning(s)`);
  }
}
