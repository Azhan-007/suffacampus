-- CreateEnum
CREATE TYPE "DriftType" AS ENUM ('reconciliation_required', 'provider_missing', 'provider_mismatch', 'orphaned_capture', 'orphaned_invoice', 'activation_drift', 'refund_drift', 'stale_pending', 'stale_overdue', 'invoice_payment_mismatch');

-- CreateEnum
CREATE TYPE "DriftStatus" AS ENUM ('detected', 'repair_attempted', 'repaired', 'manual_review_required', 'dismissed');

-- CreateEnum
CREATE TYPE "ReconciliationEventType" AS ENUM ('drift_detected', 'repair_attempted', 'repair_succeeded', 'repair_failed', 'manual_review_required');

-- CreateTable
CREATE TABLE "ReconciliationDriftRecord" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationDriftRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationAuditEvent" (
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
CREATE INDEX "ReconciliationDriftRecord_schoolId_idx" ON "ReconciliationDriftRecord"("schoolId");
CREATE INDEX "ReconciliationDriftRecord_driftType_idx" ON "ReconciliationDriftRecord"("driftType");
CREATE INDEX "ReconciliationDriftRecord_status_idx" ON "ReconciliationDriftRecord"("status");
CREATE INDEX "ReconciliationDriftRecord_entityType_entityId_idx" ON "ReconciliationDriftRecord"("entityType", "entityId");
CREATE INDEX "ReconciliationDriftRecord_providerPaymentId_idx" ON "ReconciliationDriftRecord"("providerPaymentId");
CREATE INDEX "ReconciliationDriftRecord_detectedAt_idx" ON "ReconciliationDriftRecord"("detectedAt");
CREATE INDEX "ReconciliationDriftRecord_status_driftType_idx" ON "ReconciliationDriftRecord"("status", "driftType");

-- CreateIndex
CREATE INDEX "ReconciliationAuditEvent_schoolId_idx" ON "ReconciliationAuditEvent"("schoolId");
CREATE INDEX "ReconciliationAuditEvent_eventType_idx" ON "ReconciliationAuditEvent"("eventType");
CREATE INDEX "ReconciliationAuditEvent_driftRecordId_idx" ON "ReconciliationAuditEvent"("driftRecordId");
CREATE INDEX "ReconciliationAuditEvent_createdAt_idx" ON "ReconciliationAuditEvent"("createdAt");
