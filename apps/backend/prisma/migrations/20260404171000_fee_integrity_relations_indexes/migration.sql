-- Cleanup orphaned fee-module rows before adding foreign keys.
DELETE FROM "StudentFeePayment" p
WHERE NOT EXISTS (
  SELECT 1 FROM "StudentFee" sf WHERE sf."id" = p."studentFeeId"
)
OR NOT EXISTS (
  SELECT 1 FROM "School" s WHERE s."id" = p."schoolId"
);

DELETE FROM "StudentFee" sf
WHERE NOT EXISTS (
  SELECT 1 FROM "Student" st WHERE st."id" = sf."studentId"
)
OR NOT EXISTS (
  SELECT 1 FROM "FeeStructure" fs WHERE fs."id" = sf."feeStructureId"
)
OR NOT EXISTS (
  SELECT 1 FROM "School" s WHERE s."id" = sf."schoolId"
);

DELETE FROM "FeeStructure" fs
WHERE NOT EXISTS (
  SELECT 1 FROM "Class" c WHERE c."id" = fs."classId"
)
OR NOT EXISTS (
  SELECT 1 FROM "School" s WHERE s."id" = fs."schoolId"
);

-- Add fee-module foreign keys.
ALTER TABLE "FeeStructure"
ADD CONSTRAINT "FeeStructure_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeStructure"
ADD CONSTRAINT "FeeStructure_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFee"
ADD CONSTRAINT "StudentFee_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentFee"
ADD CONSTRAINT "StudentFee_feeStructureId_fkey"
FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentFee"
ADD CONSTRAINT "StudentFee_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFeePayment"
ADD CONSTRAINT "StudentFeePayment_studentFeeId_fkey"
FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentFeePayment"
ADD CONSTRAINT "StudentFeePayment_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Add performance indexes for fee queries.
CREATE INDEX IF NOT EXISTS "Fee_schoolId_studentId_idx"
ON "Fee"("schoolId", "studentId");

CREATE INDEX IF NOT EXISTS "Fee_schoolId_classId_idx"
ON "Fee"("schoolId", "classId");

CREATE INDEX IF NOT EXISTS "Fee_transactionId_idx"
ON "Fee"("transactionId");

CREATE INDEX IF NOT EXISTS "FeeStructure_schoolId_idx"
ON "FeeStructure"("schoolId");

CREATE INDEX IF NOT EXISTS "FeeStructure_classId_idx"
ON "FeeStructure"("classId");

CREATE INDEX IF NOT EXISTS "FeeStructure_schoolId_classId_idx"
ON "FeeStructure"("schoolId", "classId");

CREATE INDEX IF NOT EXISTS "FeeStructure_schoolId_name_idx"
ON "FeeStructure"("schoolId", "name");

CREATE INDEX IF NOT EXISTS "StudentFee_schoolId_idx"
ON "StudentFee"("schoolId");

CREATE INDEX IF NOT EXISTS "StudentFee_studentId_idx"
ON "StudentFee"("studentId");

CREATE INDEX IF NOT EXISTS "StudentFee_feeStructureId_idx"
ON "StudentFee"("feeStructureId");

CREATE INDEX IF NOT EXISTS "StudentFee_schoolId_studentId_idx"
ON "StudentFee"("schoolId", "studentId");

CREATE INDEX IF NOT EXISTS "StudentFee_schoolId_feeStructureId_idx"
ON "StudentFee"("schoolId", "feeStructureId");

CREATE INDEX IF NOT EXISTS "StudentFee_schoolId_status_idx"
ON "StudentFee"("schoolId", "status");

CREATE INDEX IF NOT EXISTS "StudentFeePayment_schoolId_idx"
ON "StudentFeePayment"("schoolId");

CREATE INDEX IF NOT EXISTS "StudentFeePayment_studentFeeId_idx"
ON "StudentFeePayment"("studentFeeId");

CREATE INDEX IF NOT EXISTS "StudentFeePayment_paidAt_idx"
ON "StudentFeePayment"("paidAt");

CREATE INDEX IF NOT EXISTS "StudentFeePayment_schoolId_paidAt_idx"
ON "StudentFeePayment"("schoolId", "paidAt");

CREATE INDEX IF NOT EXISTS "StudentFeePayment_schoolId_studentFeeId_idx"
ON "StudentFeePayment"("schoolId", "studentFeeId");
