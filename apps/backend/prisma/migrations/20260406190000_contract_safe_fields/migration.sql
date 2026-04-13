-- Contract safe fields migration
-- Converts canonical fields to safe types and removes companion columns.
-- Designed to run both when companion columns exist and when they do not.

CREATE OR REPLACE FUNCTION public.contract_parse_ts(value text)
RETURNS timestamp
LANGUAGE plpgsql
AS $$
DECLARE
  v text;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  v := btrim(value);
  IF v = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN v::timestamp;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  IF v ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN (v || ' 00:00:00')::timestamp;
  END IF;

  IF v ~ '^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$' THEN
    RETURN ('1970-01-01 ' || v)::timestamp;
  END IF;

  IF v ~ '^[0-9]{1,2}:[0-5]\d\s*[AaPp][Mm]$' THEN
    RETURN to_timestamp('1970-01-01 ' || upper(v), 'YYYY-MM-DD HH12:MI AM')::timestamp;
  END IF;

  IF v ~ '^[0-9]{1,2}:[0-5]\d:[0-5]\d\s*[AaPp][Mm]$' THEN
    RETURN to_timestamp('1970-01-01 ' || upper(v), 'YYYY-MM-DD HH12:MI:SS AM')::timestamp;
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'School') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'School' AND column_name = 'trialEndDateDt') THEN
      UPDATE "School" SET "trialEndDate" = "trialEndDateDt"::text WHERE "trialEndDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "School"
    ALTER COLUMN "trialEndDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("trialEndDate");

    ALTER TABLE "School" DROP COLUMN IF EXISTS "trialEndDateDt";

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'School' AND column_name = 'cancelEffectiveDateDt') THEN
      UPDATE "School" SET "cancelEffectiveDate" = "cancelEffectiveDateDt"::text WHERE "cancelEffectiveDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "School"
    ALTER COLUMN "cancelEffectiveDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("cancelEffectiveDate");

    ALTER TABLE "School" DROP COLUMN IF EXISTS "cancelEffectiveDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Student') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Student' AND column_name = 'dateOfBirthDt') THEN
      UPDATE "Student" SET "dateOfBirth" = "dateOfBirthDt"::text WHERE "dateOfBirthDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Student"
    ALTER COLUMN "dateOfBirth" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("dateOfBirth");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Student' AND column_name = 'enrollmentDateDt') THEN
      UPDATE "Student" SET "enrollmentDate" = "enrollmentDateDt"::text WHERE "enrollmentDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Student"
    ALTER COLUMN "enrollmentDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("enrollmentDate");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Student' AND column_name = 'admissionDateDt') THEN
      UPDATE "Student" SET "admissionDate" = "admissionDateDt"::text WHERE "admissionDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Student"
    ALTER COLUMN "admissionDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("admissionDate");

    ALTER TABLE "Student" DROP COLUMN IF EXISTS "dateOfBirthDt";
    ALTER TABLE "Student" DROP COLUMN IF EXISTS "enrollmentDateDt";
    ALTER TABLE "Student" DROP COLUMN IF EXISTS "admissionDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Teacher') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Teacher' AND column_name = 'joiningDateDt') THEN
      UPDATE "Teacher" SET "joiningDate" = "joiningDateDt"::text WHERE "joiningDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Teacher"
    ALTER COLUMN "joiningDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("joiningDate");

    ALTER TABLE "Teacher" DROP COLUMN IF EXISTS "joiningDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Attendance') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Attendance' AND column_name = 'dateDt') THEN
      UPDATE "Attendance" SET "date" = "dateDt"::text WHERE "dateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Attendance"
    ALTER COLUMN "date" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("date");

    ALTER TABLE "Attendance" DROP COLUMN IF EXISTS "dateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Assignment') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Assignment' AND column_name = 'dueDateDt') THEN
      UPDATE "Assignment" SET "dueDate" = "dueDateDt"::text WHERE "dueDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Assignment"
    ALTER COLUMN "dueDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("dueDate");

    ALTER TABLE "Assignment" DROP COLUMN IF EXISTS "dueDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Event') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Event' AND column_name = 'eventDateDt') THEN
      UPDATE "Event" SET "eventDate" = "eventDateDt"::text WHERE "eventDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Event"
    ALTER COLUMN "eventDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("eventDate");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Event' AND column_name = 'endDateDt') THEN
      UPDATE "Event" SET "endDate" = "endDateDt"::text WHERE "endDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Event"
    ALTER COLUMN "endDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("endDate");

    ALTER TABLE "Event" DROP COLUMN IF EXISTS "eventDateDt";
    ALTER TABLE "Event" DROP COLUMN IF EXISTS "endDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Fee') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Fee' AND column_name = 'amountDecimal') THEN
      UPDATE "Fee" SET "amount" = "amountDecimal"::double precision WHERE "amountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Fee"
    ALTER COLUMN "amount" TYPE DECIMAL(14, 2)
    USING "amount"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Fee' AND column_name = 'amountPaidDecimal') THEN
      UPDATE "Fee" SET "amountPaid" = "amountPaidDecimal"::double precision WHERE "amountPaidDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Fee"
    ALTER COLUMN "amountPaid" TYPE DECIMAL(14, 2)
    USING "amountPaid"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Fee' AND column_name = 'dueDateDt') THEN
      UPDATE "Fee" SET "dueDate" = "dueDateDt"::text WHERE "dueDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Fee"
    ALTER COLUMN "dueDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("dueDate");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Fee' AND column_name = 'paidDateDt') THEN
      UPDATE "Fee" SET "paidDate" = "paidDateDt"::text WHERE "paidDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Fee"
    ALTER COLUMN "paidDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("paidDate");

    ALTER TABLE "Fee" DROP COLUMN IF EXISTS "amountDecimal";
    ALTER TABLE "Fee" DROP COLUMN IF EXISTS "amountPaidDecimal";
    ALTER TABLE "Fee" DROP COLUMN IF EXISTS "dueDateDt";
    ALTER TABLE "Fee" DROP COLUMN IF EXISTS "paidDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'FeeStructure') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'FeeStructure' AND column_name = 'amountDecimal') THEN
      UPDATE "FeeStructure" SET "amount" = "amountDecimal"::double precision WHERE "amountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "FeeStructure"
    ALTER COLUMN "amount" TYPE DECIMAL(14, 2)
    USING "amount"::numeric(14, 2);

    ALTER TABLE "FeeStructure" DROP COLUMN IF EXISTS "amountDecimal";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudentFee') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StudentFee' AND column_name = 'totalAmountDecimal') THEN
      UPDATE "StudentFee" SET "totalAmount" = "totalAmountDecimal"::double precision WHERE "totalAmountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "StudentFee"
    ALTER COLUMN "totalAmount" TYPE DECIMAL(14, 2)
    USING "totalAmount"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StudentFee' AND column_name = 'paidAmountDecimal') THEN
      UPDATE "StudentFee" SET "paidAmount" = "paidAmountDecimal"::double precision WHERE "paidAmountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "StudentFee"
    ALTER COLUMN "paidAmount" TYPE DECIMAL(14, 2)
    USING "paidAmount"::numeric(14, 2);

    ALTER TABLE "StudentFee" DROP COLUMN IF EXISTS "totalAmountDecimal";
    ALTER TABLE "StudentFee" DROP COLUMN IF EXISTS "paidAmountDecimal";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StudentFeePayment') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'StudentFeePayment' AND column_name = 'amountDecimal') THEN
      UPDATE "StudentFeePayment" SET "amount" = "amountDecimal"::double precision WHERE "amountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "StudentFeePayment"
    ALTER COLUMN "amount" TYPE DECIMAL(14, 2)
    USING "amount"::numeric(14, 2);

    ALTER TABLE "StudentFeePayment" DROP COLUMN IF EXISTS "amountDecimal";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LibraryTransaction') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LibraryTransaction' AND column_name = 'fineDecimal') THEN
      UPDATE "LibraryTransaction" SET "fine" = "fineDecimal"::double precision WHERE "fineDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "LibraryTransaction"
    ALTER COLUMN "fine" TYPE DECIMAL(14, 2)
    USING "fine"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LibraryTransaction' AND column_name = 'issueDateDt') THEN
      UPDATE "LibraryTransaction" SET "issueDate" = "issueDateDt"::text WHERE "issueDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "LibraryTransaction"
    ALTER COLUMN "issueDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("issueDate");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LibraryTransaction' AND column_name = 'dueDateDt') THEN
      UPDATE "LibraryTransaction" SET "dueDate" = "dueDateDt"::text WHERE "dueDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "LibraryTransaction"
    ALTER COLUMN "dueDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("dueDate");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LibraryTransaction' AND column_name = 'returnDateDt') THEN
      UPDATE "LibraryTransaction" SET "returnDate" = "returnDateDt"::text WHERE "returnDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "LibraryTransaction"
    ALTER COLUMN "returnDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("returnDate");

    ALTER TABLE "LibraryTransaction" DROP COLUMN IF EXISTS "fineDecimal";
    ALTER TABLE "LibraryTransaction" DROP COLUMN IF EXISTS "issueDateDt";
    ALTER TABLE "LibraryTransaction" DROP COLUMN IF EXISTS "dueDateDt";
    ALTER TABLE "LibraryTransaction" DROP COLUMN IF EXISTS "returnDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Period') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Period' AND column_name = 'startTimeDt') THEN
      UPDATE "Period" SET "startTime" = "startTimeDt"::text WHERE "startTimeDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Period"
    ALTER COLUMN "startTime" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("startTime");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Period' AND column_name = 'endTimeDt') THEN
      UPDATE "Period" SET "endTime" = "endTimeDt"::text WHERE "endTimeDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Period"
    ALTER COLUMN "endTime" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("endTime");

    ALTER TABLE "Period" DROP COLUMN IF EXISTS "startTimeDt";
    ALTER TABLE "Period" DROP COLUMN IF EXISTS "endTimeDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Plan') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Plan' AND column_name = 'monthlyPriceDecimal') THEN
      UPDATE "Plan" SET "monthlyPrice" = "monthlyPriceDecimal"::double precision WHERE "monthlyPriceDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Plan"
    ALTER COLUMN "monthlyPrice" TYPE DECIMAL(14, 2)
    USING "monthlyPrice"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Plan' AND column_name = 'yearlyPriceDecimal') THEN
      UPDATE "Plan" SET "yearlyPrice" = "yearlyPriceDecimal"::double precision WHERE "yearlyPriceDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Plan"
    ALTER COLUMN "yearlyPrice" TYPE DECIMAL(14, 2)
    USING "yearlyPrice"::numeric(14, 2);

    ALTER TABLE "Plan" DROP COLUMN IF EXISTS "monthlyPriceDecimal";
    ALTER TABLE "Plan" DROP COLUMN IF EXISTS "yearlyPriceDecimal";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Subscription') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Subscription' AND column_name = 'amountDecimal') THEN
      UPDATE "Subscription" SET "amount" = "amountDecimal"::double precision WHERE "amountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Subscription"
    ALTER COLUMN "amount" TYPE DECIMAL(14, 2)
    USING "amount"::numeric(14, 2);

    ALTER TABLE "Subscription" DROP COLUMN IF EXISTS "amountDecimal";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Invoice') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'amountDecimal') THEN
      UPDATE "Invoice" SET "amount" = "amountDecimal"::double precision WHERE "amountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Invoice"
    ALTER COLUMN "amount" TYPE DECIMAL(14, 2)
    USING "amount"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'periodStartDt') THEN
      UPDATE "Invoice" SET "periodStart" = "periodStartDt"::text WHERE "periodStartDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Invoice"
    ALTER COLUMN "periodStart" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("periodStart");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'periodEndDt') THEN
      UPDATE "Invoice" SET "periodEnd" = "periodEndDt"::text WHERE "periodEndDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Invoice"
    ALTER COLUMN "periodEnd" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("periodEnd");

    ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "amountDecimal";
    ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "periodStartDt";
    ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "periodEndDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Report') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Report' AND column_name = 'startDateDt') THEN
      UPDATE "Report" SET "startDate" = "startDateDt"::text WHERE "startDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Report"
    ALTER COLUMN "startDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("startDate");

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Report' AND column_name = 'endDateDt') THEN
      UPDATE "Report" SET "endDate" = "endDateDt"::text WHERE "endDateDt" IS NOT NULL;
    END IF;

    ALTER TABLE "Report"
    ALTER COLUMN "endDate" TYPE TIMESTAMP(3)
    USING public.contract_parse_ts("endDate");

    ALTER TABLE "Report" DROP COLUMN IF EXISTS "startDateDt";
    ALTER TABLE "Report" DROP COLUMN IF EXISTS "endDateDt";
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Payment') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'amountDecimal') THEN
      UPDATE "Payment" SET "amount" = "amountDecimal"::double precision WHERE "amountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Payment"
    ALTER COLUMN "amount" TYPE DECIMAL(14, 2)
    USING "amount"::numeric(14, 2);

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Payment' AND column_name = 'refundedAmountDecimal') THEN
      UPDATE "Payment" SET "refundedAmount" = "refundedAmountDecimal"::double precision WHERE "refundedAmountDecimal" IS NOT NULL;
    END IF;

    ALTER TABLE "Payment"
    ALTER COLUMN "refundedAmount" TYPE DECIMAL(14, 2)
    USING "refundedAmount"::numeric(14, 2);

    ALTER TABLE "Payment" DROP COLUMN IF EXISTS "amountDecimal";
    ALTER TABLE "Payment" DROP COLUMN IF EXISTS "refundedAmountDecimal";
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.contract_parse_ts(text);
