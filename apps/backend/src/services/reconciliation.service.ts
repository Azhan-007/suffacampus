import { prisma } from "../lib/prisma";
import { createLogger } from "../utils/logger";
import { trackError } from "./error-tracking.service";
import { fetchProviderPaymentState } from "./razorpay-reconciliation.service";
import { processProviderPayment } from "./payment.service";
import type { DriftType, DriftStatus, ReconciliationEventType } from "@prisma/client";

const log = createLogger("reconciliation");

// ─────────────────────────────────────────────────────────────
// Drift Record Management
// ─────────────────────────────────────────────────────────────

export async function createDriftRecord(params: {
  schoolId?: string | null;
  driftType: DriftType;
  entityType: string;
  entityId: string;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  driftReason: string;
  driftDetails?: Record<string, unknown>;
  expectedState?: string;
  actualState?: string;
}) {
  const existing = await prisma.reconciliationDriftRecord.findFirst({
    where: {
      entityType: params.entityType,
      entityId: params.entityId,
      driftType: params.driftType,
      status: { in: ["detected", "repair_attempted"] },
    },
  });

  if (existing) {
    return existing;
  }

  const record = await prisma.reconciliationDriftRecord.create({
    data: {
      schoolId: params.schoolId ?? undefined,
      driftType: params.driftType,
      entityType: params.entityType,
      entityId: params.entityId,
      providerPaymentId: params.providerPaymentId ?? undefined,
      providerOrderId: params.providerOrderId ?? undefined,
      driftReason: params.driftReason,
      driftDetails: params.driftDetails as any,
      expectedState: params.expectedState,
      actualState: params.actualState,
    },
  });

  await emitReconciliationEvent({
    schoolId: params.schoolId,
    eventType: "drift_detected",
    driftRecordId: record.id,
    entityType: params.entityType,
    entityId: params.entityId,
    providerPaymentId: params.providerPaymentId,
    details: { driftType: params.driftType, reason: params.driftReason },
    outcome: "detected",
  });

  log.warn({
    driftId: record.id,
    driftType: params.driftType,
    entityType: params.entityType,
    entityId: params.entityId,
  }, "Drift detected");

  return record;
}

export async function markDriftRepairAttempted(driftId: string, details?: Record<string, unknown>) {
  return prisma.reconciliationDriftRecord.update({
    where: { id: driftId },
    data: {
      status: "repair_attempted",
      repairAttemptCount: { increment: 1 },
      lastRepairAttemptAt: new Date(),
      repairDetails: details as any,
    },
  });
}

export async function markDriftRepaired(driftId: string, details?: Record<string, unknown>) {
  const record = await prisma.reconciliationDriftRecord.update({
    where: { id: driftId },
    data: {
      status: "repaired",
      repairedAt: new Date(),
      repairDetails: details as any,
    },
  });

  await emitReconciliationEvent({
    schoolId: record.schoolId,
    eventType: "repair_succeeded",
    driftRecordId: driftId,
    entityType: record.entityType,
    entityId: record.entityId,
    details,
    outcome: "success",
  });

  return record;
}

export async function markDriftManualReview(driftId: string, reason: string) {
  const record = await prisma.reconciliationDriftRecord.update({
    where: { id: driftId },
    data: { status: "manual_review_required" },
  });

  await emitReconciliationEvent({
    schoolId: record.schoolId,
    eventType: "manual_review_required",
    driftRecordId: driftId,
    entityType: record.entityType,
    entityId: record.entityId,
    details: { reason },
    outcome: "escalated",
  });

  log.error({ driftId, reason }, "Drift requires manual review");
  return record;
}

// ─────────────────────────────────────────────────────────────
// Reconciliation Audit Events (immutable)
// ─────────────────────────────────────────────────────────────

async function emitReconciliationEvent(params: {
  schoolId?: string | null;
  eventType: ReconciliationEventType;
  driftRecordId?: string | null;
  entityType?: string;
  entityId?: string;
  providerPaymentId?: string | null;
  details?: Record<string, unknown>;
  outcome?: string;
}) {
  try {
    await prisma.reconciliationAuditEvent.create({
      data: {
        schoolId: params.schoolId ?? undefined,
        eventType: params.eventType,
        driftRecordId: params.driftRecordId ?? undefined,
        entityType: params.entityType,
        entityId: params.entityId,
        providerPaymentId: params.providerPaymentId ?? undefined,
        details: params.details as any,
        outcome: params.outcome,
      },
    });
  } catch (err) {
    log.error({ err, eventType: params.eventType }, "Failed to emit reconciliation audit event");
  }
}

// ─────────────────────────────────────────────────────────────
// Drift Detection Jobs
// ─────────────────────────────────────────────────────────────

const MAX_REPAIR_ATTEMPTS = 5;
const STALE_PENDING_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const STALE_ACTIVATION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const STALE_PROCESSING_WEBHOOK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Detect webhook events stuck in PROCESSING state.
 * This indicates a worker crash or timeout during processing.
 * These events should be reset to FAILED so the retry queue can re-attempt.
 */
export async function detectStaleProcessingWebhooks(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_WEBHOOK_THRESHOLD_MS);

  const stale = await prisma.webhookEvent.findMany({
    where: {
      status: "PROCESSING",
      lastAttemptAt: { lt: cutoff },
    },
    take: 50,
    orderBy: { lastAttemptAt: "asc" },
    select: { id: true, eventId: true, provider: true, eventType: true, schoolId: true, lastAttemptAt: true },
  });

  if (stale.length === 0) return 0;

  // Reset to FAILED so BullMQ retry or repair sweep can pick them up
  const ids = stale.map((e) => e.id);
  await prisma.webhookEvent.updateMany({
    where: { id: { in: ids }, status: "PROCESSING" },
    data: {
      status: "FAILED",
      failureReason: "Stale PROCESSING state — likely worker crash. Reset for retry.",
    },
  });

  for (const event of stale) {
    log.warn(
      {
        webhookEventId: event.id,
        eventId: event.eventId,
        provider: event.provider,
        eventType: event.eventType,
        schoolId: event.schoolId,
        staleSinceMs: Date.now() - (event.lastAttemptAt?.getTime() ?? 0),
      },
      "Stale PROCESSING webhook detected — reset to FAILED"
    );
  }

  return stale.length;
}

export async function detectCapturedNotActivated(): Promise<number> {
  const payments = await prisma.legacyPayment.findMany({
    where: {
      status: "completed",
      activationState: { in: ["captured_activation_pending", "activation_failed"] },
      capturedAt: { lt: new Date(Date.now() - STALE_ACTIVATION_THRESHOLD_MS) },
    },
    take: 100,
    orderBy: { updatedAt: "asc" },
  });

  for (const p of payments) {
    await createDriftRecord({
      schoolId: p.schoolId,
      driftType: "activation_drift",
      entityType: "payment",
      entityId: p.id,
      providerPaymentId: p.gatewayId,
      providerOrderId: p.gatewayOrderId,
      driftReason: `Payment captured but activation state is ${p.activationState}`,
      expectedState: "activated",
      actualState: p.activationState ?? "unknown",
    });
  }

  return payments.length;
}

export async function detectStalePendingPayments(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_PENDING_THRESHOLD_MS);
  const payments = await prisma.legacyPayment.findMany({
    where: {
      status: "pending",
      createdAt: { lt: cutoff },
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  for (const p of payments) {
    await createDriftRecord({
      schoolId: p.schoolId,
      driftType: "stale_pending",
      entityType: "payment",
      entityId: p.id,
      providerPaymentId: p.gatewayId,
      providerOrderId: p.gatewayOrderId,
      driftReason: `Payment pending since ${p.createdAt.toISOString()}`,
      expectedState: "completed_or_failed",
      actualState: "pending",
    });
  }

  return payments.length;
}

export async function detectOrphanedInvoices(): Promise<number> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: "paid",
      razorpayPaymentId: null,
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  for (const inv of invoices) {
    await createDriftRecord({
      schoolId: inv.schoolId,
      driftType: "orphaned_invoice",
      entityType: "invoice",
      entityId: inv.id,
      driftReason: "Invoice marked paid but has no razorpayPaymentId",
      expectedState: "paid_with_provider_ref",
      actualState: "paid_no_provider_ref",
    });
  }

  return invoices.length;
}

export async function detectInvoicePaymentMismatches(): Promise<number> {
  const payments = await prisma.legacyPayment.findMany({
    where: {
      status: "completed",
      activationState: "activated",
      invoiceId: { not: null },
      gatewayId: { not: null },
    },
    take: 200,
    orderBy: { updatedAt: "asc" },
  });

  let count = 0;
  for (const p of payments) {
    const invoice = await prisma.invoice.findFirst({
      where: { razorpayPaymentId: p.gatewayId! },
    });

    if (!invoice) {
      await createDriftRecord({
        schoolId: p.schoolId,
        driftType: "invoice_payment_mismatch",
        entityType: "payment",
        entityId: p.id,
        providerPaymentId: p.gatewayId,
        driftReason: "Activated payment has no matching invoice",
        expectedState: "invoice_exists",
        actualState: "invoice_missing",
      });
      count++;
    }
  }

  return count;
}

export async function detectRefundMismatches(): Promise<number> {
  const refundedPayments = await prisma.legacyPayment.findMany({
    where: {
      status: "refunded",
      gatewayId: { not: null },
    },
    take: 50,
    orderBy: { updatedAt: "asc" },
  });

  let count = 0;
  for (const p of refundedPayments) {
    try {
      const providerState = await fetchProviderPaymentState(p.gatewayId!);
      if (!providerState.exists || !providerState.payment) continue;

      const internalRefundPaise = Number(p.refundedAmount ?? 0) * 100;
      const providerRefundPaise = providerState.payment.amountRefunded;

      if (Math.abs(internalRefundPaise - providerRefundPaise) > 0) {
        await createDriftRecord({
          schoolId: p.schoolId,
          driftType: "refund_drift",
          entityType: "payment",
          entityId: p.id,
          providerPaymentId: p.gatewayId,
          driftReason: `Refund amount mismatch: internal=${internalRefundPaise} provider=${providerRefundPaise}`,
          driftDetails: { internalRefundPaise, providerRefundPaise },
          expectedState: String(providerRefundPaise),
          actualState: String(internalRefundPaise),
        });
        count++;
      }
    } catch (err) {
      log.error({ err, paymentId: p.id }, "Error checking refund mismatch");
    }
  }

  return count;
}

export async function detectStaleOverdueInvoices(): Promise<number> {
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: "overdue",
      updatedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    take: 100,
  });

  for (const inv of overdueInvoices) {
    await createDriftRecord({
      schoolId: inv.schoolId,
      driftType: "stale_overdue",
      entityType: "invoice",
      entityId: inv.id,
      driftReason: `Invoice overdue for more than 7 days without resolution`,
    });
  }

  return overdueInvoices.length;
}

// ─────────────────────────────────────────────────────────────
// Repair Workflows
// ─────────────────────────────────────────────────────────────

export async function repairActivationDrift(driftId: string): Promise<boolean> {
  const drift = await prisma.reconciliationDriftRecord.findUnique({ where: { id: driftId } });
  if (!drift || drift.entityType !== "payment") return false;
  if (drift.repairAttemptCount >= MAX_REPAIR_ATTEMPTS) {
    await markDriftManualReview(driftId, "Max repair attempts exceeded");
    return false;
  }

  await markDriftRepairAttempted(driftId);
  await emitReconciliationEvent({
    schoolId: drift.schoolId,
    eventType: "repair_attempted",
    driftRecordId: driftId,
    entityType: "payment",
    entityId: drift.entityId,
    details: { attempt: drift.repairAttemptCount + 1 },
  });

  try {
    const payment = await prisma.legacyPayment.findUnique({ where: { id: drift.entityId } });
    if (!payment || !payment.gatewayId) {
      await markDriftManualReview(driftId, "Payment or gatewayId not found");
      return false;
    }

    if (payment.activationState === "activated") {
      await markDriftRepaired(driftId, { reason: "Already activated" });
      return true;
    }

    const result = await processProviderPayment(
      payment.gatewayId,
      payment.gatewayOrderId ?? null,
      { source: "reconcile" }
    );

    if (result.activationState === "activated") {
      await markDriftRepaired(driftId, { activationState: result.activationState });
      return true;
    }

    if (drift.repairAttemptCount + 1 >= MAX_REPAIR_ATTEMPTS) {
      await markDriftManualReview(driftId, result.activationFailureReason ?? "Repair failed after max attempts");
    }

    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emitReconciliationEvent({
      schoolId: drift.schoolId,
      eventType: "repair_failed",
      driftRecordId: driftId,
      entityType: "payment",
      entityId: drift.entityId,
      details: { error: message },
      outcome: "failure",
    });

    log.error({ err, driftId }, "Activation drift repair failed");
    trackError({ error: err, metadata: { context: "reconciliation:repair-activation", driftId } });

    if (drift.repairAttemptCount + 1 >= MAX_REPAIR_ATTEMPTS) {
      await markDriftManualReview(driftId, message);
    }
    return false;
  }
}

export async function repairStalePending(driftId: string): Promise<boolean> {
  const drift = await prisma.reconciliationDriftRecord.findUnique({ where: { id: driftId } });
  if (!drift || drift.entityType !== "payment") return false;
  if (drift.repairAttemptCount >= MAX_REPAIR_ATTEMPTS) {
    await markDriftManualReview(driftId, "Max repair attempts exceeded");
    return false;
  }

  await markDriftRepairAttempted(driftId);

  try {
    const payment = await prisma.legacyPayment.findUnique({ where: { id: drift.entityId } });
    if (!payment) {
      await markDriftManualReview(driftId, "Payment not found");
      return false;
    }

    if (payment.status !== "pending") {
      await markDriftRepaired(driftId, { reason: `Status already ${payment.status}` });
      return true;
    }

    if (!payment.gatewayId) {
      // No provider payment — check if order exists at provider
      if (payment.gatewayOrderId) {
        // Could check order status, but for now mark as failed
        await prisma.legacyPayment.update({
          where: { id: payment.id },
          data: { status: "failed", failureReason: "Stale pending — no provider payment captured" },
        });
        await markDriftRepaired(driftId, { reason: "Marked as failed — no capture" });
        return true;
      }
      await markDriftRepaired(driftId, { reason: "No gateway references — abandoned order" });
      return true;
    }

    // Has gatewayId — check provider state
    const providerState = await fetchProviderPaymentState(payment.gatewayId);
    if (!providerState.exists) {
      await createDriftRecord({
        schoolId: payment.schoolId,
        driftType: "provider_missing",
        entityType: "payment",
        entityId: payment.id,
        providerPaymentId: payment.gatewayId,
        driftReason: "Payment exists internally but not at provider",
      });
      await markDriftRepaired(driftId, { reason: "Escalated to provider_missing drift" });
      return true;
    }

    if (providerState.payment?.status === "captured") {
      // Provider says captured but we say pending — process it
      await processProviderPayment(payment.gatewayId, payment.gatewayOrderId ?? null, {
        source: "reconcile",
      });
      await markDriftRepaired(driftId, { reason: "Provider captured — reprocessed" });
      return true;
    }

    if (providerState.payment?.status === "failed") {
      await prisma.legacyPayment.update({
        where: { id: payment.id },
        data: { status: "failed", failureReason: "Provider reports payment failed" },
      });
      await markDriftRepaired(driftId, { reason: "Provider reports failed" });
      return true;
    }

    return false;
  } catch (err) {
    log.error({ err, driftId }, "Stale pending repair failed");
    trackError({ error: err, metadata: { context: "reconciliation:repair-stale-pending", driftId } });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Sweep: process all open drifts
// ─────────────────────────────────────────────────────────────

export async function runRepairSweep(): Promise<{ attempted: number; repaired: number; escalated: number }> {
  const openDrifts = await prisma.reconciliationDriftRecord.findMany({
    where: { status: { in: ["detected", "repair_attempted"] } },
    take: 50,
    orderBy: { detectedAt: "asc" },
  });

  let attempted = 0;
  let repaired = 0;
  let escalated = 0;

  for (const drift of openDrifts) {
    attempted++;
    try {
      let success = false;

      switch (drift.driftType) {
        case "activation_drift":
        case "orphaned_capture":
        case "reconciliation_required":
          success = await repairActivationDrift(drift.id);
          break;
        case "stale_pending":
          success = await repairStalePending(drift.id);
          break;
        default:
          // Types that require manual review
          if (drift.repairAttemptCount >= MAX_REPAIR_ATTEMPTS) {
            await markDriftManualReview(drift.id, `No auto-repair for ${drift.driftType}`);
            escalated++;
          }
          break;
      }

      if (success) repaired++;
    } catch (err) {
      log.error({ err, driftId: drift.id }, "Repair sweep error");
    }

    // Reload to check if escalated
    const updated = await prisma.reconciliationDriftRecord.findUnique({ where: { id: drift.id } });
    if (updated?.status === "manual_review_required") escalated++;
  }

  if (attempted > 0) {
    log.info({ attempted, repaired, escalated }, "Repair sweep completed");
  }

  return { attempted, repaired, escalated };
}

// ─────────────────────────────────────────────────────────────
// Full reconciliation run (all detection + repair)
// ─────────────────────────────────────────────────────────────

export async function runFullReconciliation(): Promise<{
  detected: Record<string, number>;
  repair: { attempted: number; repaired: number; escalated: number };
}> {
  log.info("Starting full reconciliation run");

  const detected: Record<string, number> = {};

  try { detected.capturedNotActivated = await detectCapturedNotActivated(); } catch (err) {
    log.error({ err }, "detectCapturedNotActivated failed");
  }
  try { detected.stalePending = await detectStalePendingPayments(); } catch (err) {
    log.error({ err }, "detectStalePendingPayments failed");
  }
  try { detected.orphanedInvoices = await detectOrphanedInvoices(); } catch (err) {
    log.error({ err }, "detectOrphanedInvoices failed");
  }
  try { detected.invoicePaymentMismatches = await detectInvoicePaymentMismatches(); } catch (err) {
    log.error({ err }, "detectInvoicePaymentMismatches failed");
  }
  try { detected.staleOverdue = await detectStaleOverdueInvoices(); } catch (err) {
    log.error({ err }, "detectStaleOverdueInvoices failed");
  }
  try { detected.staleProcessingWebhooks = await detectStaleProcessingWebhooks(); } catch (err) {
    log.error({ err }, "detectStaleProcessingWebhooks failed");
  }

  const repair = await runRepairSweep();

  log.info({ detected, repair }, "Full reconciliation run completed");
  return { detected, repair };
}

// ─────────────────────────────────────────────────────────────
// Operational Inspection Helpers (used by admin/ops endpoints)
// ─────────────────────────────────────────────────────────────

export interface PaymentHealthSummary {
  stuckPayments: number;          // captured_activation_pending or activation_failed
  reconciliationRequired: number; // reconciliation_required state
  pendingOlderThan2h: number;     // stale pending orders
  openDrifts: number;             // detected + repair_attempted drift records
  driftByType: Record<string, number>;
  deadLetterWebhooks: number;     // DEAD_LETTER webhook events
  failedWebhooks: number;         // FAILED webhook events (retriable)
  staleProcessingWebhooks: number; // PROCESSING > 10 min (likely crashed)
  manualReviewDrifts: number;     // drifts escalated to manual review
  generatedAt: string;
}

/**
 * Returns a lightweight operational health snapshot of the payment system.
 * Uses parallel DB reads optimized for the admin health endpoint.
 * Does NOT call any external APIs.
 */
export async function getPaymentHealthSummary(): Promise<PaymentHealthSummary> {
  const staleActivationCutoff = new Date(Date.now() - 30 * 60 * 1000);
  const stalePendingCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleProcessingCutoff = new Date(Date.now() - 10 * 60 * 1000);

  const [
    stuckPayments,
    reconciliationRequired,
    pendingOlderThan2h,
    openDriftsRaw,
    deadLetterWebhooks,
    failedWebhooks,
    staleProcessingWebhooks,
    manualReviewDrifts,
  ] = await Promise.all([
    prisma.legacyPayment.count({
      where: {
        status: "completed",
        activationState: { in: ["captured_activation_pending", "activation_failed"] },
        capturedAt: { lt: staleActivationCutoff },
      },
    }),
    prisma.legacyPayment.count({
      where: { activationState: "reconciliation_required" },
    }),
    prisma.legacyPayment.count({
      where: { status: "pending", createdAt: { lt: stalePendingCutoff } },
    }),
    prisma.reconciliationDriftRecord.groupBy({
      by: ["driftType"],
      where: { status: { in: ["detected", "repair_attempted"] } },
      _count: true,
    }),
    prisma.webhookEvent.count({ where: { status: "DEAD_LETTER" } }),
    prisma.webhookEvent.count({ where: { status: "FAILED" } }),
    prisma.webhookEvent.count({
      where: { status: "PROCESSING", lastAttemptAt: { lt: staleProcessingCutoff } },
    }),
    prisma.reconciliationDriftRecord.count({
      where: { status: "manual_review_required" },
    }),
  ]);

  const driftByType: Record<string, number> = {};
  let openDrifts = 0;
  for (const row of openDriftsRaw) {
    driftByType[row.driftType] = row._count;
    openDrifts += row._count;
  }

  return {
    stuckPayments,
    reconciliationRequired,
    pendingOlderThan2h,
    openDrifts,
    driftByType,
    deadLetterWebhooks,
    failedWebhooks,
    staleProcessingWebhooks,
    manualReviewDrifts,
    generatedAt: new Date().toISOString(),
  };
}
