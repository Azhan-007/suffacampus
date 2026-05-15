-- Atomic payment activation, immutable invoices, and recovery ledger.

DO $$
BEGIN
  CREATE TYPE "PaymentActivationState" AS ENUM (
    'captured_activation_pending',
    'activation_failed',
    'reconciliation_required',
    'activated'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "periodKey" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "immutableAt" TIMESTAMP(3);

ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "activationState" "PaymentActivationState",
  ADD COLUMN IF NOT EXISTS "activationAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "activationLastError" TEXT,
  ADD COLUMN IF NOT EXISTS "activationRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activationCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciliationMarker" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliationRequiredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "capturedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "ledgerEventId" TEXT;

CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "currentSequence" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceSequence_schoolId_periodKey_key"
  ON "InvoiceSequence"("schoolId", "periodKey");

CREATE INDEX IF NOT EXISTS "InvoiceSequence_schoolId_periodKey_idx"
  ON "InvoiceSequence"("schoolId", "periodKey");

CREATE TABLE IF NOT EXISTS "PaymentActivationLedger" (
  "id" TEXT PRIMARY KEY,
  "schoolId" TEXT NOT NULL,
  "legacyPaymentId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerOrderId" TEXT,
  "action" TEXT NOT NULL,
  "state" "PaymentActivationState" NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentActivationLedger_legacyPaymentId_action_key"
  ON "PaymentActivationLedger"("legacyPaymentId", "action");

CREATE INDEX IF NOT EXISTS "PaymentActivationLedger_schoolId_idx"
  ON "PaymentActivationLedger"("schoolId");

CREATE INDEX IF NOT EXISTS "PaymentActivationLedger_providerPaymentId_idx"
  ON "PaymentActivationLedger"("providerPaymentId");

CREATE INDEX IF NOT EXISTS "PaymentActivationLedger_providerOrderId_idx"
  ON "PaymentActivationLedger"("providerOrderId");

CREATE INDEX IF NOT EXISTS "PaymentActivationLedger_state_idx"
  ON "PaymentActivationLedger"("state");

CREATE INDEX IF NOT EXISTS "Invoice_schoolId_periodKey_idx"
  ON "Invoice"("schoolId", "periodKey");

CREATE INDEX IF NOT EXISTS "Payment_activationState_idx"
  ON "Payment"("activationState");

CREATE INDEX IF NOT EXISTS "Payment_gatewayId_idx"
  ON "Payment"("gatewayId");

CREATE INDEX IF NOT EXISTS "Payment_gatewayOrderId_idx"
  ON "Payment"("gatewayOrderId");
