-- Tenant access state (lifecycle + gating)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantAccessStatus') THEN
    CREATE TYPE "TenantAccessStatus" AS ENUM ('active', 'blocked');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantLifecycleState') THEN
    CREATE TYPE "TenantLifecycleState" AS ENUM (
      'trial',
      'active',
      'past_due',
      'expired',
      'cancelled',
      'suspended'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "TenantAccessState" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "accessState" "TenantAccessStatus" NOT NULL DEFAULT 'active',
  "lifecycleState" "TenantLifecycleState" NOT NULL DEFAULT 'trial',
  "reason" TEXT,
  "effectiveUntil" TIMESTAMP(3),
  "sourceSubscriptionId" TEXT,
  "accessVersion" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  "lastTransitionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantAccessState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantAccessState_schoolId_key" UNIQUE ("schoolId"),
  CONSTRAINT "TenantAccessState_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TenantAccessState_sourceSubscriptionId_fkey" FOREIGN KEY ("sourceSubscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TenantAccessState_schoolId_accessState_idx" ON "TenantAccessState"("schoolId", "accessState");
CREATE INDEX IF NOT EXISTS "TenantAccessState_schoolId_lifecycleState_idx" ON "TenantAccessState"("schoolId", "lifecycleState");
CREATE INDEX IF NOT EXISTS "TenantAccessState_accessState_idx" ON "TenantAccessState"("accessState");
CREATE INDEX IF NOT EXISTS "TenantAccessState_lifecycleState_idx" ON "TenantAccessState"("lifecycleState");
CREATE INDEX IF NOT EXISTS "TenantAccessState_effectiveUntil_idx" ON "TenantAccessState"("effectiveUntil");
