-- Add idempotency + verification columns for secure payment flow.
ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

-- Keep latest row per Razorpay payment id, null older duplicates before unique index.
WITH gateway_id_dupes AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "gatewayId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "Payment"
  WHERE "gatewayId" IS NOT NULL
)
UPDATE "Payment" p
SET "gatewayId" = NULL
FROM gateway_id_dupes d
WHERE p."id" = d."id"
  AND d.rn > 1;

-- Keep latest row per Razorpay order id, null older duplicates before unique index.
WITH gateway_order_dupes AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "gatewayOrderId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "Payment"
  WHERE "gatewayOrderId" IS NOT NULL
)
UPDATE "Payment" p
SET "gatewayOrderId" = NULL
FROM gateway_order_dupes d
WHERE p."id" = d."id"
  AND d.rn > 1;

-- Keep latest row per (schoolId, idempotencyKey), null older duplicates before unique index.
WITH idempotency_dupes AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "schoolId", "idempotencyKey"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "Payment"
  WHERE "idempotencyKey" IS NOT NULL
)
UPDATE "Payment" p
SET "idempotencyKey" = NULL
FROM idempotency_dupes d
WHERE p."id" = d."id"
  AND d.rn > 1;

-- Database-level idempotency / dedupe guarantees.
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_gatewayId_key"
ON "Payment"("gatewayId");

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_gatewayOrderId_key"
ON "Payment"("gatewayOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_schoolId_idempotencyKey_key"
ON "Payment"("schoolId", "idempotencyKey");
