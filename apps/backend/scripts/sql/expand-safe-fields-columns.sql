-- Expand-safe-fields: additive only, no destructive changes.
-- Applies changes only to tables that exist in the target database.

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'School') THEN
		ALTER TABLE "School"
			ADD COLUMN IF NOT EXISTS "trialEndDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "cancelEffectiveDateDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Student') THEN
		ALTER TABLE "Student"
			ADD COLUMN IF NOT EXISTS "dateOfBirthDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "enrollmentDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "admissionDateDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Teacher') THEN
		ALTER TABLE "Teacher"
			ADD COLUMN IF NOT EXISTS "joiningDateDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Attendance') THEN
		ALTER TABLE "Attendance"
			ADD COLUMN IF NOT EXISTS "dateDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Assignment') THEN
		ALTER TABLE "Assignment"
			ADD COLUMN IF NOT EXISTS "dueDateDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Event') THEN
		ALTER TABLE "Event"
			ADD COLUMN IF NOT EXISTS "eventDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "endDateDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Fee') THEN
		ALTER TABLE "Fee"
			ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(14, 2),
			ADD COLUMN IF NOT EXISTS "dueDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "paidDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "amountPaidDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'FeeStructure') THEN
		ALTER TABLE "FeeStructure"
			ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudentFee') THEN
		ALTER TABLE "StudentFee"
			ADD COLUMN IF NOT EXISTS "totalAmountDecimal" DECIMAL(14, 2),
			ADD COLUMN IF NOT EXISTS "paidAmountDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudentFeePayment') THEN
		ALTER TABLE "StudentFeePayment"
			ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LibraryTransaction') THEN
		ALTER TABLE "LibraryTransaction"
			ADD COLUMN IF NOT EXISTS "issueDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "dueDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "returnDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "fineDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Period') THEN
		ALTER TABLE "Period"
			ADD COLUMN IF NOT EXISTS "startTimeDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "endTimeDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Plan') THEN
		ALTER TABLE "Plan"
			ADD COLUMN IF NOT EXISTS "monthlyPriceDecimal" DECIMAL(14, 2),
			ADD COLUMN IF NOT EXISTS "yearlyPriceDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Subscription') THEN
		ALTER TABLE "Subscription"
			ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(14, 2);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Invoice') THEN
		ALTER TABLE "Invoice"
			ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(14, 2),
			ADD COLUMN IF NOT EXISTS "periodStartDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "periodEndDt" TIMESTAMP(3);
	END IF;
END
$$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Report') THEN
		ALTER TABLE "Report"
			ADD COLUMN IF NOT EXISTS "startDateDt" TIMESTAMP(3),
			ADD COLUMN IF NOT EXISTS "endDateDt" TIMESTAMP(3);
	END IF;
END
$$;

-- LegacyPayment is mapped as table "Payment".
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Payment') THEN
		ALTER TABLE "Payment"
			ADD COLUMN IF NOT EXISTS "amountDecimal" DECIMAL(14, 2),
			ADD COLUMN IF NOT EXISTS "refundedAmountDecimal" DECIMAL(14, 2);
	END IF;
END
$$;
