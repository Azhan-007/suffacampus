-- Durable webhook event store for Razorpay/Stripe processing.

DO $$
BEGIN
  CREATE TYPE "WebhookEventStatus" AS ENUM (
    'RECEIVED',
    'VERIFIED',
    'PROCESSING',
    'PROCESSED',
    'FAILED',
    'DEAD_LETTER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "WebhookEvent"
  ADD COLUMN IF NOT EXISTS "eventType" TEXT,
  ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "schoolId" TEXT,
  ADD COLUMN IF NOT EXISTS "rawPayload" TEXT,
  ADD COLUMN IF NOT EXISTS "payloadHash" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN IF NOT EXISTS "processingAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deadLetteredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "WebhookEvent"
SET "status" = CASE
  WHEN "processedAt" IS NOT NULL THEN 'PROCESSED'::"WebhookEventStatus"
  ELSE 'VERIFIED'::"WebhookEventStatus"
END
WHERE "status" = 'RECEIVED';

CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_eventType_idx"
  ON "WebhookEvent"("provider", "eventType");

CREATE INDEX IF NOT EXISTS "WebhookEvent_providerPaymentId_idx"
  ON "WebhookEvent"("providerPaymentId");

CREATE INDEX IF NOT EXISTS "WebhookEvent_providerOrderId_idx"
  ON "WebhookEvent"("providerOrderId");

CREATE INDEX IF NOT EXISTS "WebhookEvent_schoolId_idx"
  ON "WebhookEvent"("schoolId");

CREATE INDEX IF NOT EXISTS "WebhookEvent_status_idx"
  ON "WebhookEvent"("status");

CREATE INDEX IF NOT EXISTS "WebhookEvent_payloadHash_idx"
  ON "WebhookEvent"("payloadHash");
