import cron, { type ScheduledTask } from "node-cron";
import {
  processExpiredTrials,
  processOverdueSubscriptions,
  processExpiredGrace,
} from "../services/subscription.service";
import { processOverdueFeeNotifications } from "../services/overdue-fee-notification.service";
import { executeReportById } from "../services/report.service";
import { prisma } from "../lib/prisma";
import { trackError } from "../services/error-tracking.service";
import {
  trialExpiringEmail,
  usageLimitWarningEmail,
} from "../services/email-templates";
import { enqueueEmail, initEmailQueue, shutdownEmailQueue } from "../services/email-queue.service";
import { createLogger } from "../utils/logger";
import { assertSchoolScope } from "../lib/tenant-scope";
import { setReportQueueBacklog } from "../plugins/metrics";

const log = createLogger("workers");

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
  let overdueFeeRunning = false;
  tasks.push(cron.schedule("0 8 * * *", async () => {
    if (overdueFeeRunning) {
      log.warn("[workers] Skipped overdue fee notifications — previous run still active");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    if (lastOverdueFeeRunDate === today) {
      log.info({ date: today }, "[workers] Skipped overdue fee notifications (already ran today)");
      return;
    }

    overdueFeeRunning = true;
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
    } finally {
      overdueFeeRunning = false;
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

  // ── Pending Report Processing ─────────────────────────────────────────
  // Every 30 seconds — pick up and process enqueued reports
  tasks.push(cron.schedule("*/1 * * * *", async () => {
    try {
      await processPendingReports();
    } catch (err) {
      log.error({ err }, "Report processing worker failed");
      trackError({ error: err, metadata: { context: "worker:report-processing" } });
    }
  }));

  // ── WebhookEvent Cleanup ──────────────────────────────────────────────
  // Every day at 3:00 AM — delete processed webhook events older than 30 days
  tasks.push(cron.schedule("0 3 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await prisma.webhookEvent.deleteMany({
        where: { processedAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        log.info(`[workers] Cleaned up ${result.count} old webhook event(s)`);
      }
    } catch (err) {
      log.error({ err }, "Webhook event cleanup worker failed");
      trackError({ error: err, metadata: { context: "worker:webhook-cleanup" } });
    }
  }));

  // ── Data Retention Cleanup ────────────────────────────────────────────
  // Every day at 3:30 AM — purge old records from high-growth tables.
  // Each operation is independent; one failure does not block others.
  tasks.push(cron.schedule("30 3 * * *", async () => {
    const results: string[] = [];

    // 1. AuditLog — 90-day retention
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const r = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (r.count > 0) results.push(`auditLog:${r.count}`);
    } catch (err) {
      log.error({ err }, "Retention cleanup failed: auditLog");
      trackError({ error: err, metadata: { context: "worker:retention:auditLog" } });
    }

    // 2. ErrorLog — 30-day retention
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const r = await prisma.errorLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (r.count > 0) results.push(`errorLog:${r.count}`);
    } catch (err) {
      log.error({ err }, "Retention cleanup failed: errorLog");
      trackError({ error: err, metadata: { context: "worker:retention:errorLog" } });
    }

    // 3. WebhookFailure — 60-day retention (resolved only)
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const r = await prisma.webhookFailure.deleteMany({
        where: { status: "resolved", resolvedAt: { lt: cutoff } },
      });
      if (r.count > 0) results.push(`webhookFailure:${r.count}`);
    } catch (err) {
      log.error({ err }, "Retention cleanup failed: webhookFailure");
      trackError({ error: err, metadata: { context: "worker:retention:webhookFailure" } });
    }

    // 4. Report — 90-day HTML purge (keep metadata + stats)
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const r = await prisma.report.updateMany({
        where: {
          status: "completed",
          generatedAt: { lt: cutoff },
          html: { not: "" },
        },
        data: { html: "" },
      });
      if (r.count > 0) results.push(`reportHtmlPurge:${r.count}`);
    } catch (err) {
      log.error({ err }, "Retention cleanup failed: report HTML");
      trackError({ error: err, metadata: { context: "worker:retention:reportHtml" } });
    }

    // 5. Notification — 90-day retention (cascade deletes reads + deliveries)
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const r = await prisma.notification.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (r.count > 0) results.push(`notification:${r.count}`);
    } catch (err) {
      log.error({ err }, "Retention cleanup failed: notification");
      trackError({ error: err, metadata: { context: "worker:retention:notification" } });
    }

    if (results.length > 0) {
      log.info({ cleaned: results }, "[workers] Data retention cleanup completed");
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

  let count = 0;

  for (const school of activeSchools) {
    assertSchoolScope(school.id);

    // Re-run safe per tenant: overwrite only this school's daily snapshot.
    await prisma.usageRecord.deleteMany({
      where: {
        schoolId: school.id,
        date: snapshotDate,
        period: "daily",
      },
    });

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

  if (schools.length === 0) return;

  // Batch: 2 groupBy queries total instead of 2 count queries per school
  const schoolIds = schools.map((s) => s.id);

  const [studentCounts, teacherCounts] = await Promise.all([
    prisma.student.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, isDeleted: false },
      _count: true,
    }),
    prisma.teacher.groupBy({
      by: ["schoolId"],
      where: { schoolId: { in: schoolIds }, isDeleted: false },
      _count: true,
    }),
  ]);

  const studentMap = new Map(studentCounts.map((r) => [r.schoolId, r._count]));
  const teacherMap = new Map(teacherCounts.map((r) => [r.schoolId, r._count]));

  let sent = 0;

  for (const school of schools) {
    const schoolName = school.name ?? "School";
    const adminEmail = school.email;

    if (!adminEmail) continue;

    const checks = [
      { resource: "Students", current: studentMap.get(school.id) ?? 0, limit: school.maxStudents },
      { resource: "Teachers", current: teacherMap.get(school.id) ?? 0, limit: school.maxTeachers },
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


// ---------------------------------------------------------------------------
// Report generation worker
// ---------------------------------------------------------------------------

/**
 * Process pending reports created by enqueueReport().
 * Picks up to 5 reports per cycle, processes sequentially.
 * Also recovers stuck reports (in "processing" for > 10 min).
 */
const REPORT_BATCH_SIZE = 10;
const REPORT_STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

async function processPendingReports(): Promise<void> {
  const cutoff = new Date(Date.now() - REPORT_STUCK_THRESHOLD_MS);

  // Find pending reports + stuck "processing" reports
  const reports = await prisma.report.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "processing", createdAt: { lt: cutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: REPORT_BATCH_SIZE,
    select: { id: true, schoolId: true, type: true },
  });

  if (reports.length === 0) {
    setReportQueueBacklog(0);
    return;
  }

  setReportQueueBacklog(reports.length);

  for (const report of reports) {
    try {
      await executeReportById(report.id);
      log.info(
        { reportId: report.id, schoolId: report.schoolId, type: report.type },
        "[workers] Report processed"
      );
    } catch (err) {
      log.error(
        { err, reportId: report.id },
        "[workers] Report processing failed"
      );
      trackError({ error: err, metadata: { context: "worker:report-processing", reportId: report.id } });
    }
  }
}
