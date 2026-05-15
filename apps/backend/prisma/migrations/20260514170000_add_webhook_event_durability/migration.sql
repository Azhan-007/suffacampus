-- Durable webhook event store for Razorpay/Stripe processing.
-- Safe to run multiple times (idempotent). Self-contained: creates WebhookEvent
-- if it doesn't exist, then adds new durability columns if not present.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookEventStatus') THEN
    CREATE TYPE "WebhookEventStatus" AS ENUM (
      'RECEIVED',
      'VERIFIED',
      'PROCESSING',
      'PROCESSED',
      'FAILED',
      'DEAD_LETTER'
    );
  END IF;
END $$;

-- Create WebhookEvent table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'razorpay',
  "eventId" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_eventId_key"
  ON "WebhookEvent"("provider", "eventId");

-- Add durability columns (idempotent ADD COLUMN IF NOT EXISTS)
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
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

-- Backfill status for any existing rows that had processedAt set
UPDATE "WebhookEvent"
SET "status" = CASE
  WHEN "processedAt" IS NOT NULL THEN 'PROCESSED'::"WebhookEventStatus"
  ELSE 'VERIFIED'::"WebhookEventStatus"
END
WHERE "status" = 'RECEIVED' AND "processedAt" IS NOT NULL;

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

