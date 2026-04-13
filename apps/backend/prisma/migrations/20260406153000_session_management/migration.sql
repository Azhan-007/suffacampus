-- Persistent session storage with JWT token revocation support.

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL,
  "userUid" TEXT NOT NULL,
  "schoolId" TEXT,
  "device" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "currentJti" TEXT NOT NULL,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Session_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Session_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RevokedToken" (
  "id" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "sessionId" TEXT,
  "userUid" TEXT NOT NULL,
  "schoolId" TEXT,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevokedToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RevokedToken_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RevokedToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Session_currentJti_key" ON "Session"("currentJti");
CREATE INDEX IF NOT EXISTS "Session_userUid_revokedAt_idx" ON "Session"("userUid", "revokedAt");
CREATE INDEX IF NOT EXISTS "Session_schoolId_revokedAt_idx" ON "Session"("schoolId", "revokedAt");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX IF NOT EXISTS "Session_lastActiveAt_idx" ON "Session"("lastActiveAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RevokedToken_jti_key" ON "RevokedToken"("jti");
CREATE INDEX IF NOT EXISTS "RevokedToken_userUid_expiresAt_idx" ON "RevokedToken"("userUid", "expiresAt");
CREATE INDEX IF NOT EXISTS "RevokedToken_sessionId_expiresAt_idx" ON "RevokedToken"("sessionId", "expiresAt");
CREATE INDEX IF NOT EXISTS "RevokedToken_schoolId_expiresAt_idx" ON "RevokedToken"("schoolId", "expiresAt");
