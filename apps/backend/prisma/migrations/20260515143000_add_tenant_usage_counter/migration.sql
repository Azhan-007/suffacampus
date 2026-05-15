-- Tenant usage counters for quota enforcement

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantUsageResourceType') THEN
    CREATE TYPE "TenantUsageResourceType" AS ENUM ('students', 'teachers', 'storage');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "TenantUsageCounter" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "resourceType" "TenantUsageResourceType" NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "limitSnapshot" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantUsageCounter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantUsageCounter_schoolId_resourceType_key" UNIQUE ("schoolId", "resourceType"),
  CONSTRAINT "TenantUsageCounter_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TenantUsageCounter_schoolId_idx" ON "TenantUsageCounter"("schoolId");
CREATE INDEX IF NOT EXISTS "TenantUsageCounter_resourceType_idx" ON "TenantUsageCounter"("resourceType");
CREATE INDEX IF NOT EXISTS "TenantUsageCounter_schoolId_resourceType_updatedAt_idx" ON "TenantUsageCounter"("schoolId", "resourceType", "updatedAt");
