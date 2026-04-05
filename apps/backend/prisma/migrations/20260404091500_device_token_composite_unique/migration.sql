-- Drop single-token uniqueness to allow account/tenant scoped token rows
DROP INDEX IF EXISTS "DeviceToken_token_key";

-- Enforce uniqueness per token+user+tenant
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_userId_schoolId_key"
  ON "DeviceToken"("token", "userId", "schoolId");

-- Keep token lookup fast for cleanup paths
CREATE INDEX IF NOT EXISTS "DeviceToken_token_idx"
  ON "DeviceToken"("token");
