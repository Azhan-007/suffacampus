import { prisma } from "../lib/prisma";
import pino from "pino";
import { writeAuditLog } from "./audit.service";

const log = pino({ name: "subscription" });

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
 * Attempt to transition a school's subscription status.
 */
export async function transitionStatus(
  schoolId: string,
  newStatus: SubStatus,
  metadata: Record<string, unknown> = {},
  performedBy = "system"
): Promise<boolean> {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  if (!school) return false;
  const currentStatus = (school.subscriptionStatus ?? "trial") as SubStatus;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    log.warn({ schoolId, currentStatus, newStatus }, "Invalid subscription transition");
    return false;
  }

  await prisma.school.update({
    where: { id: schoolId },
    data: {
      subscriptionStatus: newStatus as any,
      ...metadata,
    },
  });

  await writeAuditLog("SUBSCRIPTION_STATUS_CHANGE", performedBy, schoolId, {
    from: currentStatus,
    to: newStatus,
    ...metadata,
  });

  return true;
}

// ---------------------------------------------------------------------------
// Trial management
// ---------------------------------------------------------------------------

export async function processExpiredTrials(): Promise<number> {
  const now = new Date().toISOString().split("T")[0];

  const trials = await prisma.school.findMany({
    where: {
      subscriptionStatus: "trial",
      trialEndDate: { lte: now },
    },
  });

  let count = 0;
  for (const school of trials) {
    const success = await transitionStatus(school.id, "expired", {
      expiredReason: "trial_ended",
    });
    if (success) count++;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Active → Past Due
// ---------------------------------------------------------------------------

export async function processOverdueSubscriptions(): Promise<number> {
  const now = new Date();

  const schools = await prisma.school.findMany({
    where: {
      subscriptionStatus: "active",
      currentPeriodEnd: { lte: now },
    },
  });

  let count = 0;
  for (const school of schools) {
    if (school.autoRenew) continue;

    const success = await transitionStatus(school.id, "past_due", {
      overdueReason: "period_ended",
    });
    if (success) count++;
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

  const schools = await prisma.school.findMany({
    where: {
      subscriptionStatus: "past_due",
      currentPeriodEnd: { lte: cutoff },
    },
  });

  let count = 0;
  for (const school of schools) {
    const success = await transitionStatus(school.id, "expired", {
      expiredReason: "grace_period_ended",
    });
    if (success) count++;
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
  const school = await prisma.school.findUnique({ where: { id: schoolId } });

  if (!school) throw new Error("School not found");

  const status = (school.subscriptionStatus ?? "trial") as SubStatus;
  if (status !== "active") {
    throw new Error(`Cannot cancel subscription in '${status}' state`);
  }

  const effectiveDate = school.currentPeriodEnd
    ? school.currentPeriodEnd.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  await transitionStatus(schoolId, "cancelled", {
    cancelledAt: new Date(),
    cancelEffectiveDate: effectiveDate,
    autoRenew: false,
  }, performedBy);

  return { cancelEffectiveDate: effectiveDate };
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
  const now = new Date();
  const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);

  await transitionStatus(schoolId, "active", {
    subscriptionPlan: plan,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    autoRenew: true,
    paymentFailureCount: 0,
  }, performedBy);
}
