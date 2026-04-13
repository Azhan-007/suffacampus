import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

type FieldMapping = {
  oldField: string;
  newField: string;
};

type ModelMigrationConfig = {
  model: string;
  delegate: string;
  mappings: FieldMapping[];
};

type FailureSample = {
  model: string;
  id: string;
  oldField: string;
  newField: string;
  rawValue: string;
  reason: string;
};

type ModelMigrationStats = {
  model: string;
  scannedRows: number;
  updatedRows: number;
  successCount: number;
  failedCount: number;
  skippedNullCount: number;
  skippedAlreadySetCount: number;
  updateErrorCount: number;
  invalidDecimalCount: number;
  invalidDateCount: number;
};

const prisma = new PrismaClient();

const BATCH_SIZE = Number.parseInt(
  process.env.SAFE_FIELDS_MIGRATION_BATCH_SIZE ?? "500",
  10
);
const FAILURE_SAMPLE_LIMIT = Number.parseInt(
  process.env.SAFE_FIELDS_MIGRATION_FAILURE_SAMPLE_LIMIT ?? "200",
  10
);

const decimalMigrations: ModelMigrationConfig[] = [
  {
    model: "Fee",
    delegate: "fee",
    mappings: [
      { oldField: "amount", newField: "amountDecimal" },
      { oldField: "amountPaid", newField: "amountPaidDecimal" },
    ],
  },
  {
    model: "FeeStructure",
    delegate: "feeStructure",
    mappings: [{ oldField: "amount", newField: "amountDecimal" }],
  },
  {
    model: "StudentFee",
    delegate: "studentFee",
    mappings: [
      { oldField: "totalAmount", newField: "totalAmountDecimal" },
      { oldField: "paidAmount", newField: "paidAmountDecimal" },
    ],
  },
  {
    model: "Payment",
    delegate: "payment",
    mappings: [{ oldField: "amount", newField: "amountDecimal" }],
  },
  {
    model: "LibraryTransaction",
    delegate: "libraryTransaction",
    mappings: [{ oldField: "fine", newField: "fineDecimal" }],
  },
  {
    model: "Plan",
    delegate: "plan",
    mappings: [
      { oldField: "monthlyPrice", newField: "monthlyPriceDecimal" },
      { oldField: "yearlyPrice", newField: "yearlyPriceDecimal" },
    ],
  },
  {
    model: "Subscription",
    delegate: "subscription",
    mappings: [{ oldField: "amount", newField: "amountDecimal" }],
  },
  {
    model: "Invoice",
    delegate: "invoice",
    mappings: [{ oldField: "amount", newField: "amountDecimal" }],
  },
  {
    model: "LegacyPayment",
    delegate: "legacyPayment",
    mappings: [
      { oldField: "amount", newField: "amountDecimal" },
      { oldField: "refundedAmount", newField: "refundedAmountDecimal" },
    ],
  },
];

const dateMigrations: ModelMigrationConfig[] = [
  {
    model: "School",
    delegate: "school",
    mappings: [
      { oldField: "trialEndDate", newField: "trialEndDateDt" },
      { oldField: "cancelEffectiveDate", newField: "cancelEffectiveDateDt" },
    ],
  },
  {
    model: "Student",
    delegate: "student",
    mappings: [
      { oldField: "dateOfBirth", newField: "dateOfBirthDt" },
      { oldField: "enrollmentDate", newField: "enrollmentDateDt" },
      { oldField: "admissionDate", newField: "admissionDateDt" },
    ],
  },
  {
    model: "Teacher",
    delegate: "teacher",
    mappings: [{ oldField: "joiningDate", newField: "joiningDateDt" }],
  },
  {
    model: "Attendance",
    delegate: "attendance",
    mappings: [{ oldField: "date", newField: "dateDt" }],
  },
  {
    model: "Assignment",
    delegate: "assignment",
    mappings: [{ oldField: "dueDate", newField: "dueDateDt" }],
  },
  {
    model: "Event",
    delegate: "event",
    mappings: [
      { oldField: "eventDate", newField: "eventDateDt" },
      { oldField: "endDate", newField: "endDateDt" },
    ],
  },
  {
    model: "Fee",
    delegate: "fee",
    mappings: [
      { oldField: "dueDate", newField: "dueDateDt" },
      { oldField: "paidDate", newField: "paidDateDt" },
    ],
  },
  {
    model: "LibraryTransaction",
    delegate: "libraryTransaction",
    mappings: [
      { oldField: "issueDate", newField: "issueDateDt" },
      { oldField: "dueDate", newField: "dueDateDt" },
      { oldField: "returnDate", newField: "returnDateDt" },
    ],
  },
  {
    model: "Period",
    delegate: "period",
    mappings: [
      { oldField: "startTime", newField: "startTimeDt" },
      { oldField: "endTime", newField: "endTimeDt" },
    ],
  },
  {
    model: "Invoice",
    delegate: "invoice",
    mappings: [
      { oldField: "periodStart", newField: "periodStartDt" },
      { oldField: "periodEnd", newField: "periodEndDt" },
    ],
  },
  {
    model: "Report",
    delegate: "report",
    mappings: [
      { oldField: "startDate", newField: "startDateDt" },
      { oldField: "endDate", newField: "endDateDt" },
    ],
  },
];

function emptyStats(model: string): ModelMigrationStats {
  return {
    model,
    scannedRows: 0,
    updatedRows: 0,
    successCount: 0,
    failedCount: 0,
    skippedNullCount: 0,
    skippedAlreadySetCount: 0,
    updateErrorCount: 0,
    invalidDecimalCount: 0,
    invalidDateCount: 0,
  };
}

function toRawString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseDecimalValue(raw: unknown): { value: Prisma.Decimal | null; error?: string } {
  if (raw === null || raw === undefined) {
    return { value: null };
  }

  if (raw instanceof Prisma.Decimal) {
    return { value: raw };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) {
      return { value: null, error: "non-finite-number" };
    }

    try {
      return { value: new Prisma.Decimal(raw.toString()) };
    } catch {
      return { value: null, error: "invalid-decimal-number" };
    }
  }

  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return { value: null };
    }

    try {
      return { value: new Prisma.Decimal(value) };
    } catch {
      return { value: null, error: "invalid-decimal-string" };
    }
  }

  return { value: null, error: "unsupported-decimal-type" };
}

function parseDateValue(raw: unknown): { value: Date | null; error?: string } {
  if (raw === null || raw === undefined) {
    return { value: null };
  }

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      return { value: null, error: "invalid-date-object" };
    }
    return { value: raw };
  }

  if (typeof raw !== "string") {
    return { value: null, error: "unsupported-date-type" };
  }

  const value = raw.trim();
  if (!value) {
    return { value: null };
  }

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [_, year, month, day] = dateOnly;
    const parsed = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
    );

    if (!Number.isNaN(parsed.getTime())) {
      return { value: parsed };
    }
    return { value: null, error: "invalid-date-only" };
  }

  const timeOnly24h = value.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (timeOnly24h) {
    const [_, hh, mm, ss] = timeOnly24h;
    const parsed = new Date(
      Date.UTC(1970, 0, 1, Number(hh), Number(mm), Number(ss ?? "0"), 0)
    );

    if (!Number.isNaN(parsed.getTime())) {
      return { value: parsed };
    }
    return { value: null, error: "invalid-time-only-24h" };
  }

  const timeOnly12h = value.match(
    /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\s*([aApP][mM])$/
  );
  if (timeOnly12h) {
    const [_, hh, mm, ss, ampm] = timeOnly12h;
    let hour = Number(hh);

    if (hour < 1 || hour > 12) {
      return { value: null, error: "invalid-time-only-12h-hour" };
    }

    const upper = ampm.toUpperCase();
    if (upper === "PM" && hour !== 12) hour += 12;
    if (upper === "AM" && hour === 12) hour = 0;

    const parsed = new Date(
      Date.UTC(1970, 0, 1, hour, Number(mm), Number(ss ?? "0"), 0)
    );

    if (!Number.isNaN(parsed.getTime())) {
      return { value: parsed };
    }
    return { value: null, error: "invalid-time-only-12h" };
  }

  if (/^\d{10,13}$/.test(value)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const ms = value.length === 10 ? numeric * 1000 : numeric;
      const parsed = new Date(ms);
      if (!Number.isNaN(parsed.getTime())) {
        return { value: parsed };
      }
    }
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return { value: parsed };
  }

  return { value: null, error: "unparseable-date" };
}

function createSelect(mappings: FieldMapping[]): Record<string, true> {
  const select: Record<string, true> = { id: true };

  for (const mapping of mappings) {
    select[mapping.oldField] = true;
    select[mapping.newField] = true;
  }

  return select;
}

function recordFailure(
  failureSamples: FailureSample[],
  failure: FailureSample
): void {
  if (failureSamples.length >= FAILURE_SAMPLE_LIMIT) {
    return;
  }

  failureSamples.push(failure);
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;
  if (code === "P2021") {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  return message.includes("does not exist in the current database");
}

async function runDecimalMigration(
  config: ModelMigrationConfig,
  failureSamples: FailureSample[]
): Promise<ModelMigrationStats> {
  const stats = emptyStats(config.model);
  const delegate = (prisma as unknown as Record<string, any>)[config.delegate] as {
    findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };

  if (!delegate) {
    throw new Error(`Prisma delegate '${config.delegate}' not found`);
  }

  let cursor: string | undefined;
  const select = createSelect(config.mappings);

  while (true) {
    const rows = await delegate.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select,
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      stats.scannedRows += 1;

      const id = String(row.id);
      const data: Record<string, unknown> = {};
      let pendingSuccessfulConversions = 0;

      for (const mapping of config.mappings) {
        const oldValue = row[mapping.oldField];
        const newValue = row[mapping.newField];

        if (newValue !== null && newValue !== undefined) {
          stats.skippedAlreadySetCount += 1;
          continue;
        }

        if (oldValue === null || oldValue === undefined) {
          stats.skippedNullCount += 1;
          continue;
        }

        const parsed = parseDecimalValue(oldValue);
        if (parsed.error) {
          stats.failedCount += 1;
          stats.invalidDecimalCount += 1;

          recordFailure(failureSamples, {
            model: config.model,
            id,
            oldField: mapping.oldField,
            newField: mapping.newField,
            rawValue: toRawString(oldValue),
            reason: parsed.error,
          });

          continue;
        }

        if (!parsed.value) {
          stats.skippedNullCount += 1;
          continue;
        }

        data[mapping.newField] = parsed.value;
        pendingSuccessfulConversions += 1;
      }

      if (pendingSuccessfulConversions === 0) {
        continue;
      }

      try {
        await delegate.update({
          where: { id },
          data,
        });

        stats.updatedRows += 1;
        stats.successCount += pendingSuccessfulConversions;
      } catch (error) {
        stats.updateErrorCount += 1;
        stats.failedCount += pendingSuccessfulConversions;

        recordFailure(failureSamples, {
          model: config.model,
          id,
          oldField: "*",
          newField: "*",
          rawValue: JSON.stringify(data),
          reason: `update-failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    cursor = String(rows[rows.length - 1].id);
  }

  return stats;
}

async function runDateMigration(
  config: ModelMigrationConfig,
  failureSamples: FailureSample[]
): Promise<ModelMigrationStats> {
  const stats = emptyStats(config.model);
  const delegate = (prisma as unknown as Record<string, any>)[config.delegate] as {
    findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
    update: (args: Record<string, unknown>) => Promise<unknown>;
  };

  if (!delegate) {
    throw new Error(`Prisma delegate '${config.delegate}' not found`);
  }

  let cursor: string | undefined;
  const select = createSelect(config.mappings);

  while (true) {
    const rows = await delegate.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select,
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      stats.scannedRows += 1;

      const id = String(row.id);
      const data: Record<string, unknown> = {};
      let pendingSuccessfulConversions = 0;

      for (const mapping of config.mappings) {
        const oldValue = row[mapping.oldField];
        const newValue = row[mapping.newField];

        if (newValue !== null && newValue !== undefined) {
          stats.skippedAlreadySetCount += 1;
          continue;
        }

        if (oldValue === null || oldValue === undefined) {
          stats.skippedNullCount += 1;
          continue;
        }

        const parsed = parseDateValue(oldValue);
        if (parsed.error) {
          stats.failedCount += 1;
          stats.invalidDateCount += 1;

          recordFailure(failureSamples, {
            model: config.model,
            id,
            oldField: mapping.oldField,
            newField: mapping.newField,
            rawValue: toRawString(oldValue),
            reason: parsed.error,
          });

          continue;
        }

        if (!parsed.value) {
          stats.skippedNullCount += 1;
          continue;
        }

        data[mapping.newField] = parsed.value;
        pendingSuccessfulConversions += 1;
      }

      if (pendingSuccessfulConversions === 0) {
        continue;
      }

      try {
        await delegate.update({
          where: { id },
          data,
        });

        stats.updatedRows += 1;
        stats.successCount += pendingSuccessfulConversions;
      } catch (error) {
        stats.updateErrorCount += 1;
        stats.failedCount += pendingSuccessfulConversions;

        recordFailure(failureSamples, {
          model: config.model,
          id,
          oldField: "*",
          newField: "*",
          rawValue: JSON.stringify(data),
          reason: `update-failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    cursor = String(rows[rows.length - 1].id);
  }

  return stats;
}

function printStats(header: string, stats: ModelMigrationStats[]): void {
  console.log(`\n=== ${header} ===`);

  for (const stat of stats) {
    console.log(
      [
        `[${stat.model}]`,
        `rows_scanned=${stat.scannedRows}`,
        `rows_updated=${stat.updatedRows}`,
        `success=${stat.successCount}`,
        `failed=${stat.failedCount}`,
        `skipped_null=${stat.skippedNullCount}`,
        `skipped_already_set=${stat.skippedAlreadySetCount}`,
        `update_errors=${stat.updateErrorCount}`,
        `invalid_decimal=${stat.invalidDecimalCount}`,
        `invalid_date=${stat.invalidDateCount}`,
      ].join(" ")
    );
  }

  const totals = stats.reduce(
    (acc, stat) => {
      acc.rows_scanned += stat.scannedRows;
      acc.rows_updated += stat.updatedRows;
      acc.success += stat.successCount;
      acc.failed += stat.failedCount;
      acc.skipped_null += stat.skippedNullCount;
      acc.skipped_already_set += stat.skippedAlreadySetCount;
      acc.update_errors += stat.updateErrorCount;
      acc.invalid_decimal += stat.invalidDecimalCount;
      acc.invalid_date += stat.invalidDateCount;
      return acc;
    },
    {
      rows_scanned: 0,
      rows_updated: 0,
      success: 0,
      failed: 0,
      skipped_null: 0,
      skipped_already_set: 0,
      update_errors: 0,
      invalid_decimal: 0,
      invalid_date: 0,
    }
  );

  console.log("--- totals ---");
  console.log(
    [
      `rows_scanned=${totals.rows_scanned}`,
      `rows_updated=${totals.rows_updated}`,
      `success=${totals.success}`,
      `failed=${totals.failed}`,
      `skipped_null=${totals.skipped_null}`,
      `skipped_already_set=${totals.skipped_already_set}`,
      `update_errors=${totals.update_errors}`,
      `invalid_decimal=${totals.invalid_decimal}`,
      `invalid_date=${totals.invalid_date}`,
    ].join(" ")
  );
}

async function main(): Promise<void> {
  if (!Number.isFinite(BATCH_SIZE) || BATCH_SIZE < 1) {
    throw new Error("SAFE_FIELDS_MIGRATION_BATCH_SIZE must be a positive integer");
  }

  console.log("Starting safe-field migration...");
  console.log(`Batch size: ${BATCH_SIZE}`);

  const failureSamples: FailureSample[] = [];

  const decimalStats: ModelMigrationStats[] = [];
  for (const config of decimalMigrations) {
    console.log(`Migrating decimal fields for ${config.model}...`);
    try {
      const stats = await runDecimalMigration(config, failureSamples);
      decimalStats.push(stats);
    } catch (error) {
      if (isMissingTableError(error)) {
        console.warn(
          `Skipping decimal migration for ${config.model}: underlying table is missing in this database.`
        );
        decimalStats.push(emptyStats(config.model));
        continue;
      }

      throw error;
    }
  }

  const dateStats: ModelMigrationStats[] = [];
  for (const config of dateMigrations) {
    console.log(`Migrating date fields for ${config.model}...`);
    try {
      const stats = await runDateMigration(config, failureSamples);
      dateStats.push(stats);
    } catch (error) {
      if (isMissingTableError(error)) {
        console.warn(
          `Skipping date migration for ${config.model}: underlying table is missing in this database.`
        );
        dateStats.push(emptyStats(config.model));
        continue;
      }

      throw error;
    }
  }

  printStats("Decimal Migration Summary", decimalStats);
  printStats("Date Migration Summary", dateStats);

  console.log("\n=== Failure Samples (up to limit) ===");
  if (failureSamples.length === 0) {
    console.log("No failed conversions.");
  } else {
    for (const sample of failureSamples) {
      console.log(
        `[${sample.model}] id=${sample.id} ${sample.oldField}->${sample.newField} reason=${sample.reason} raw=${sample.rawValue}`
      );
    }
  }

  console.log("\nSafe-field migration completed.");
}

main()
  .catch((error) => {
    console.error("Safe-field migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
