import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import pino from "pino";
import { writeAuditLog } from "./audit.service";
import { assertSchoolScope } from "../lib/tenant-scope";
import {
  transitionTenantLifecycle,
  expireTenant,
  markPastDue,
  activatePaid,
  resolveTenantAccessState,
  isTenantAccessStateAvailable,
} from "./tenant-lifecycle.service";

const log = pino({ name: "subscription" });

function isSchemaCompatibilityError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

/**
 * Subscription state machine:
 *
 *   trial → active (payment received)
 *   trial → expired (trial ends, no payment)
 *   active → past_due (period ends, no renewal)
 *   past_due → expired (7-day grace period passes)
 *   past_due → active (payment received)
 *   expired → active (reactivation + payment)
 *   active → cancelled (user cancels; effective at period end)
 *   cancelled → active (re-subscribe)
 */

export type SubStatus = "trial" | "active" | "past_due" | "expired" | "cancelled";

const VALID_TRANSITIONS: Record<SubStatus, SubStatus[]> = {
  trial: ["active", "expired"],
  active: ["past_due", "cancelled"],
  past_due: ["active", "expired"],
  expired: ["active", "trial"],
  cancelled: ["active"],
};

/**
 * Allowlist of School model fields safe to update during subscription transitions.
 * Prevents mass assignment of unrelated fields via metadata.
 */
const SUBSCRIPTION_SAFE_FIELDS = [
  "subscriptionPlan",
  "currentPeriodStart",
  "currentPeriodEnd",
  "autoRenew",
  "paymentFailureCount",
  "cancelledAt",
  "cancelEffectiveDate",
  "expiredReason",
  "overdueReason",
] as const;

/**
 * Attempt to transition a school's subscription status.
 * Uses optimistic locking — the update only succeeds if
 * the current status still matches what we read, preventing
 * race conditions between concurrent webhooks.
 */
export async function transitionStatus(
  schoolId: string,
  newStatus: SubStatus,
  metadata: Record<string, unknown> = {},
  performedBy = "system"
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const snapshot = await resolveTenantAccessState(schoolId);
  if (!snapshot) return false;

  const currentStatus = snapshot.lifecycleState as SubStatus;
  if (!(currentStatus in VALID_TRANSITIONS)) {
    log.warn({ schoolId, currentStatus }, "Unsupported lifecycle state for transition");
    return false;
  }

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    log.warn({ schoolId, currentStatus, newStatus }, "Invalid subscription transition");
    return false;
  }

  const safeData: Record<string, unknown> = {};
  for (const key of SUBSCRIPTION_SAFE_FIELDS) {
    if (key in metadata && metadata[key] !== undefined) {
      safeData[key] = metadata[key];
    }
  }

  const outcome = await transitionTenantLifecycle({
    schoolId,
    targetLifecycle: newStatus,
    accessState: newStatus === "expired" || newStatus === "cancelled" ? "blocked" : "active",
    reason: typeof metadata.reason === "string" ? metadata.reason : undefined,
    performedBy,
    source: "subscription_service",
    schoolUpdate: safeData,
  });

  if (outcome.status === "applied" || outcome.status === "noop") {
    await writeAuditLog("SUBSCRIPTION_STATUS_CHANGE", performedBy, schoolId, {
      from: currentStatus,
      to: newStatus,
      reason: metadata?.reason,
      plan: metadata?.plan,
    });
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Trial management
// ---------------------------------------------------------------------------

export async function processExpiredTrials(): Promise<number> {
  const now = new Date();
  let trials: { id: string }[] = [];
  let useFallback = !isTenantAccessStateAvailable();

  if (!useFallback) {
    try {
      trials = await prisma.school.findMany({
        where: {
          tenantAccessState: { lifecycleState: "trial" },
          trialEndDate: { lte: now },
        },
        select: { id: true },
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) {
        throw error;
      }
      log.warn({ err: error }, "Trial expiry worker falling back to school status");
      useFallback = true;
    }
  }

  if (useFallback) {
    trials = await prisma.school.findMany({
      where: {
        subscriptionStatus: "trial",
        trialEndDate: { lte: now },
      },
      select: { id: true },
    });
  }

  let count = 0;
  for (const school of trials) {
    const result = await expireTenant({
      schoolId: school.id,
      reason: "trial_ended",
      source: "worker:trial-expiry",
    });
    if (result.status === "applied") count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Active → Past Due
// ---------------------------------------------------------------------------

export async function processOverdueSubscriptions(): Promise<number> {
  const now = new Date();

  let schools: { id: string; autoRenew: boolean; currentPeriodEnd: Date | null }[] = [];
  let useFallback = !isTenantAccessStateAvailable();

  if (!useFallback) {
    try {
      schools = await prisma.school.findMany({
        where: {
          tenantAccessState: { lifecycleState: "active" },
          currentPeriodEnd: { lte: now },
        },
        select: { id: true, autoRenew: true, currentPeriodEnd: true },
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) {
        throw error;
      }
      log.warn({ err: error }, "Overdue worker falling back to school status");
      useFallback = true;
    }
  }

  if (useFallback) {
    schools = await prisma.school.findMany({
      where: {
        subscriptionStatus: "active",
        currentPeriodEnd: { lte: now },
      },
      select: { id: true, autoRenew: true, currentPeriodEnd: true },
    });
  }

  let count = 0;
  for (const school of schools) {
    if (school.autoRenew) continue;

    const result = await markPastDue({
      schoolId: school.id,
      periodEnd: school.currentPeriodEnd ?? null,
      reason: "period_ended",
      source: "worker:overdue-subscriptions",
    });
    if (result.status === "applied") count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Past Due → Expired (after 7-day grace)
// ---------------------------------------------------------------------------

const GRACE_PERIOD_DAYS = 7;

export async function processExpiredGrace(): Promise<number> {
  const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - graceMs);

  let schools: { id: string; currentPeriodEnd: Date | null }[] = [];
  let useFallback = !isTenantAccessStateAvailable();

  if (!useFallback) {
    try {
      schools = await prisma.school.findMany({
        where: {
          tenantAccessState: { lifecycleState: "past_due" },
          currentPeriodEnd: { lte: cutoff },
        },
        select: { id: true, currentPeriodEnd: true },
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) {
        throw error;
      }
      log.warn({ err: error }, "Grace expiry worker falling back to school status");
      useFallback = true;
    }
  }

  if (useFallback) {
    schools = await prisma.school.findMany({
      where: {
        subscriptionStatus: "past_due",
        currentPeriodEnd: { lte: cutoff },
      },
      select: { id: true, currentPeriodEnd: true },
    });
  }

  let count = 0;
  for (const school of schools) {
    const result = await expireTenant({
      schoolId: school.id,
      reason: "grace_period_ended",
      source: "worker:grace-expiry",
    });
    if (result.status === "applied") count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

export async function cancelSubscription(
  schoolId: string,
  performedBy: string
): Promise<{ cancelEffectiveDate: string }> {
  assertSchoolScope(schoolId);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  if (!school) throw new Error("School not found");

  const status = (school.subscriptionStatus ?? "trial") as SubStatus;
  if (status !== "active") {
    throw new Error(`Cannot cancel subscription in '${status}' state`);
  }

  const effectiveDate = school.currentPeriodEnd ?? new Date();
  const effectiveDateIso = effectiveDate.toISOString().split("T")[0];

  await transitionTenantLifecycle({
    schoolId,
    targetLifecycle: "cancelled",
    accessState: "active",
    reason: "cancelled",
    performedBy,
    source: "subscription_cancel",
    schoolUpdate: {
      cancelledAt: new Date(),
      cancelEffectiveDate: effectiveDate,
      autoRenew: false,
    },
  });

  return { cancelEffectiveDate: effectiveDateIso };
}

// ---------------------------------------------------------------------------
// Reactivation
// ---------------------------------------------------------------------------

export async function reactivateSubscription(
  schoolId: string,
  plan: string,
  periodDays: number,
  performedBy = "system"
): Promise<void> {
  assertSchoolScope(schoolId);

  const now = new Date();
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  await activatePaid({
    schoolId,
    plan,
    periodStart: now,
    periodEnd,
    autoRenew: true,
    performedBy,
    reason: "reactivated",
    source: "subscription_reactivate",
  });
}
