-- Refresh token storage for rotating refresh tokens.

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" TEXT NOT NULL,
  "selector" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "parentId" TEXT,
  "replacedById" TEXT,
  "sessionId" TEXT NOT NULL,
  "userUid" TEXT NOT NULL,
  "schoolId" TEXT,
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "reuseDetectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefreshToken_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefreshToken_userUid_fkey" FOREIGN KEY ("userUid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefreshToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_selector_key" ON "RefreshToken"("selector");
CREATE INDEX IF NOT EXISTS "RefreshToken_userUid_revokedAt_idx" ON "RefreshToken"("userUid", "revokedAt");
CREATE INDEX IF NOT EXISTS "RefreshToken_sessionId_revokedAt_idx" ON "RefreshToken"("sessionId", "revokedAt");
CREATE INDEX IF NOT EXISTS "RefreshToken_familyId_revokedAt_idx" ON "RefreshToken"("familyId", "revokedAt");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");
