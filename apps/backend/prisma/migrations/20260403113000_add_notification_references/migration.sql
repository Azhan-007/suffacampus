-- AlterTable
ALTER TABLE "Notification"
ADD COLUMN "referenceId" TEXT,
ADD COLUMN "referenceType" TEXT;

-- CreateIndex
CREATE INDEX "Notification_referenceId_referenceType_targetId_idx"
ON "Notification"("referenceId", "referenceType", "targetId");
