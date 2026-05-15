-- Reconciliation drift detection and repair records.
-- Safe to run multiple times (idempotent) — all objects use IF NOT EXISTS guards.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriftType') THEN
    CREATE TYPE "DriftType" AS ENUM (
      'reconciliation_required',
      'provider_missing',
      'provider_mismatch',
      'orphaned_capture',
      'orphaned_invoice',
      'activation_drift',
      'refund_drift',
      'stale_pending',
      'stale_overdue',
      'invoice_payment_mismatch'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DriftStatus') THEN
    CREATE TYPE "DriftStatus" AS ENUM (
      'detected',
      'repair_attempted',
      'repaired',
      'manual_review_required',
      'dismissed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReconciliationEventType') THEN
    CREATE TYPE "ReconciliationEventType" AS ENUM (
      'drift_detected',
      'repair_attempted',
      'repair_succeeded',
      'repair_failed',
      'manual_review_required'
    );
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReconciliationDriftRecord" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "driftType" "DriftType" NOT NULL,
    "status" "DriftStatus" NOT NULL DEFAULT 'detected',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "providerOrderId" TEXT,
    "driftReason" TEXT NOT NULL,
    "driftDetails" JSONB,
    "expectedState" TEXT,
    "actualState" TEXT,
    "repairAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastRepairAttemptAt" TIMESTAMP(3),
    "repairedAt" TIMESTAMP(3),
    "repairDetails" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationDriftRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReconciliationAuditEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT,
    "eventType" "ReconciliationEventType" NOT NULL,
    "driftRecordId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "providerPaymentId" TEXT,
    "details" JSONB,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_schoolId_idx" ON "ReconciliationDriftRecord"("schoolId");
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_driftType_idx" ON "ReconciliationDriftRecord"("driftType");
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_status_idx" ON "ReconciliationDriftRecord"("status");
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_entityType_entityId_idx" ON "ReconciliationDriftRecord"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_providerPaymentId_idx" ON "ReconciliationDriftRecord"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_detectedAt_idx" ON "ReconciliationDriftRecord"("detectedAt");
CREATE INDEX IF NOT EXISTS "ReconciliationDriftRecord_status_driftType_idx" ON "ReconciliationDriftRecord"("status", "driftType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReconciliationAuditEvent_schoolId_idx" ON "ReconciliationAuditEvent"("schoolId");
CREATE INDEX IF NOT EXISTS "ReconciliationAuditEvent_eventType_idx" ON "ReconciliationAuditEvent"("eventType");
CREATE INDEX IF NOT EXISTS "ReconciliationAuditEvent_driftRecordId_idx" ON "ReconciliationAuditEvent"("driftRecordId");
CREATE INDEX IF NOT EXISTS "ReconciliationAuditEvent_createdAt_idx" ON "ReconciliationAuditEvent"("createdAt");

