/**
 * Fee System Migration Script
 * ───────────────────────────────────────────────────────────────
 * Migrates legacy Fee records into the normalized FeeStructure →
 * StudentFee → Payment architecture.
 *
 * Usage:
 *   npx tsx scripts/migrate-fees.ts                  # full run
 *   npx tsx scripts/migrate-fees.ts --dry-run        # preview only
 *   npx tsx scripts/migrate-fees.ts --school=abc123  # single school
 *
 * Safety:
 *   - Idempotent: uses legacyFeeId on StudentFee to detect already-migrated records
 *   - Batched: processes 100 fee records per transaction
 *   - Non-destructive: never modifies or deletes legacy Fee records
 *   - Audit logged: writes LEGACY_FEE_MIGRATION per school
 */

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ─── CLI Flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SCHOOL_FLAG = args.find((a) => a.startsWith("--school="));
const TARGET_SCHOOL_ID = SCHOOL_FLAG ? SCHOOL_FLAG.split("=")[1] : undefined;
const BATCH_SIZE = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

interface MigrationStats {
  schoolId: string;
  schoolName: string;
  totalLegacyFees: number;
  alreadyMigrated: number;
  structuresCreated: number;
  studentFeesCreated: number;
  paymentsCreated: number;
  errors: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDecimal(value: unknown): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "number") return new Prisma.Decimal(value);
  if (typeof value === "string") return new Prisma.Decimal(value);
  return new Prisma.Decimal(0);
}

function isPositive(value: Prisma.Decimal): boolean {
  return value.greaterThan(new Prisma.Decimal(0));
}

function mapLegacyStatus(status: string): "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" {
  switch (status) {
    case "Paid":
      return "PAID";
    case "Partial":
      return "PARTIAL";
    case "Overdue":
      return "OVERDUE";
    case "Pending":
    default:
      return "PENDING";
  }
}

/**
 * Build a deterministic key for a FeeStructure from legacy Fee fields.
 * Groups by (schoolId, feeType, classId, amount) so that
 * students in the same class with the same fee type and amount share a structure.
 */
function structureKey(schoolId: string, feeType: string, classId: string, amount: Prisma.Decimal): string {
  return `${schoolId}::${feeType}::${classId}::${amount.toString()}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Fee System Migration — Legacy Fee → FeeStructure/StudentFee");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (TARGET_SCHOOL_ID) {
    console.log(`  Target School: ${TARGET_SCHOOL_ID}`);
  }
  console.log("═══════════════════════════════════════════════════════════════\n");

  // 1. Fetch target schools
  const schoolWhere: Prisma.SchoolWhereInput = TARGET_SCHOOL_ID
    ? { id: TARGET_SCHOOL_ID }
    : { isActive: true };

  const schools = await prisma.school.findMany({
    where: schoolWhere,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (schools.length === 0) {
    console.log("No schools found matching criteria. Exiting.");
    return;
  }

  console.log(`Found ${schools.length} school(s) to process.\n`);

  const allStats: MigrationStats[] = [];

  for (const school of schools) {
    const stats = await migrateSchool(school.id, school.name);
    allStats.push(stats);
  }

  // 2. Summary report
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  MIGRATION SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");

  let grandTotal = 0;
  let grandMigrated = 0;
  let grandSkipped = 0;
  let grandStructures = 0;
  let grandPayments = 0;
  let grandErrors = 0;

  for (const stats of allStats) {
    const newlyMigrated = stats.studentFeesCreated;
    console.log(`  ${stats.schoolName} (${stats.schoolId})`);
    console.log(`    Legacy Fees:        ${stats.totalLegacyFees}`);
    console.log(`    Already Migrated:   ${stats.alreadyMigrated}`);
    console.log(`    Structures Created: ${stats.structuresCreated}`);
    console.log(`    StudentFees Created:${newlyMigrated}`);
    console.log(`    Payments Created:   ${stats.paymentsCreated}`);
    if (stats.errors.length > 0) {
      console.log(`    Errors:             ${stats.errors.length}`);
      for (const err of stats.errors.slice(0, 5)) {
        console.log(`      - ${err}`);
      }
      if (stats.errors.length > 5) {
        console.log(`      ... and ${stats.errors.length - 5} more`);
      }
    }
    console.log("");

    grandTotal += stats.totalLegacyFees;
    grandMigrated += newlyMigrated;
    grandSkipped += stats.alreadyMigrated;
    grandStructures += stats.structuresCreated;
    grandPayments += stats.paymentsCreated;
    grandErrors += stats.errors.length;
  }

  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Total Legacy Fees:    ${grandTotal}`);
  console.log(`  Already Migrated:     ${grandSkipped}`);
  console.log(`  Newly Migrated:       ${grandMigrated}`);
  console.log(`  Structures Created:   ${grandStructures}`);
  console.log(`  Payments Created:     ${grandPayments}`);
  console.log(`  Errors:               ${grandErrors}`);
  console.log(`  Mode:                 ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

// ─── Per-School Migration ─────────────────────────────────────────────────────

async function migrateSchool(schoolId: string, schoolName: string): Promise<MigrationStats> {
  const stats: MigrationStats = {
    schoolId,
    schoolName,
    totalLegacyFees: 0,
    alreadyMigrated: 0,
    structuresCreated: 0,
    studentFeesCreated: 0,
    paymentsCreated: 0,
    errors: [],
  };

  console.log(`▸ Processing: ${schoolName} (${schoolId})`);

  // Count total legacy fees
  const totalCount = await prisma.fee.count({ where: { schoolId } });
  stats.totalLegacyFees = totalCount;

  if (totalCount === 0) {
    console.log(`  → No legacy fees found. Skipping.\n`);
    return stats;
  }

  console.log(`  → Found ${totalCount} legacy fee(s)`);

  // Count already-migrated (have legacyFeeId set)
  const alreadyMigrated = await prisma.studentFee.count({
    where: {
      schoolId,
      legacyFeeId: { not: null },
    },
  });
  stats.alreadyMigrated = alreadyMigrated;

  if (alreadyMigrated > 0) {
    console.log(`  → ${alreadyMigrated} already migrated`);
  }

  // Cache of FeeStructure keys → IDs (to avoid creating duplicates)
  const structureCache = new Map<string, string>();

  // Pre-load existing FeeStructures for this school
  const existingStructures = await prisma.feeStructure.findMany({
    where: { schoolId },
    select: { id: true, name: true, amount: true, classId: true, feeType: true },
  });

  for (const s of existingStructures) {
    const key = structureKey(schoolId, s.feeType ?? s.name, s.classId, toDecimal(s.amount));
    structureCache.set(key, s.id);
  }

  // Pre-load already-migrated legacy fee IDs (to skip them)
  const migratedFeeIds = new Set<string>();
  if (alreadyMigrated > 0) {
    const migrated = await prisma.studentFee.findMany({
      where: { schoolId, legacyFeeId: { not: null } },
      select: { legacyFeeId: true },
    });
    for (const m of migrated) {
      if (m.legacyFeeId) migratedFeeIds.add(m.legacyFeeId);
    }
  }

  // Process in cursor-based batches
  let cursor: string | undefined;
  let batchNum = 0;

  while (true) {
    const batch = await prisma.fee.findMany({
      where: { schoolId },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (batch.length === 0) break;
    batchNum++;

    // Filter out already-migrated
    const toMigrate = batch.filter((fee) => !migratedFeeIds.has(fee.id));

    if (toMigrate.length > 0 && !DRY_RUN) {
      await processBatch(schoolId, toMigrate, structureCache, stats);
    } else if (toMigrate.length > 0 && DRY_RUN) {
      // Dry-run: count what would be created
      for (const fee of toMigrate) {
        const key = structureKey(
          schoolId,
          fee.feeType || "General",
          fee.classId,
          toDecimal(fee.amount)
        );

        if (!structureCache.has(key)) {
          structureCache.set(key, `dry-${stats.structuresCreated}`);
          stats.structuresCreated++;
        }

        stats.studentFeesCreated++;

        const paidAmount = toDecimal(fee.amountPaid);
        if (isPositive(paidAmount)) {
          stats.paymentsCreated++;
        }
      }
    }

    cursor = batch[batch.length - 1].id;

    if (batch.length < BATCH_SIZE) break;
  }

  // Write audit log (live mode only)
  if (!DRY_RUN && stats.studentFeesCreated > 0) {
    try {
      await prisma.auditLog.create({
        data: {
          action: "LEGACY_FEE_MIGRATION",
          userId: "system",
          schoolId,
          metadata: {
            totalLegacyFees: stats.totalLegacyFees,
            alreadyMigrated: stats.alreadyMigrated,
            structuresCreated: stats.structuresCreated,
            studentFeesCreated: stats.studentFeesCreated,
            paymentsCreated: stats.paymentsCreated,
            errorCount: stats.errors.length,
            migratedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err) {
      console.warn(`  ⚠ Failed to write audit log: ${err}`);
    }
  }

  const status = DRY_RUN ? "(dry run)" : "";
  console.log(
    `  → Done: ${stats.studentFeesCreated} migrated, ${stats.structuresCreated} structures, ${stats.paymentsCreated} payments ${status}\n`
  );

  return stats;
}

// ─── Batch Processing ─────────────────────────────────────────────────────────

async function processBatch(
  schoolId: string,
  fees: Array<{
    id: string;
    studentId: string;
    studentName: string | null;
    classId: string;
    sectionId: string;
    amount: Prisma.Decimal | any;
    dueDate: Date;
    paidDate: Date | null;
    status: string;
    paymentMode: string | null;
    transactionId: string | null;
    feeType: string;
    amountPaid: Prisma.Decimal | any;
    remarks: string | null;
    createdAt: Date;
  }>,
  structureCache: Map<string, string>,
  stats: MigrationStats
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      for (const fee of fees) {
        try {
          const feeType = fee.feeType || "General";
          const amount = toDecimal(fee.amount);
          const paidAmount = toDecimal(fee.amountPaid);
          const key = structureKey(schoolId, feeType, fee.classId, amount);

          // 1. Ensure FeeStructure exists
          let feeStructureId = structureCache.get(key);

          if (!feeStructureId) {
            const structure = await tx.feeStructure.create({
              data: {
                schoolId,
                name: feeType,
                feeType,
                amount,
                classId: fee.classId,
                dueDate: fee.dueDate,
                isActive: true,
              },
            });
            feeStructureId = structure.id;
            structureCache.set(key, feeStructureId);
            stats.structuresCreated++;
          }

          // 2. Create StudentFee
          const studentFee = await tx.studentFee.create({
            data: {
              studentId: fee.studentId,
              feeStructureId,
              schoolId,
              totalAmount: amount,
              paidAmount,
              status: mapLegacyStatus(fee.status),
              dueDate: fee.dueDate,
              studentName: fee.studentName,
              classId: fee.classId,
              sectionId: fee.sectionId,
              remarks: fee.remarks,
              legacyFeeId: fee.id,
            },
          });
          stats.studentFeesCreated++;

          // 3. Create Payment if there's a paid amount
          if (isPositive(paidAmount)) {
            await tx.payment.create({
              data: {
                studentFeeId: studentFee.id,
                amount: paidAmount,
                paidAt: fee.paidDate ?? fee.createdAt,
                paymentMode: fee.paymentMode,
                transactionId: fee.transactionId,
                schoolId,
              },
            });
            stats.paymentsCreated++;
          }
        } catch (err: any) {
          // Check if it's a unique constraint violation on legacyFeeId
          if (err?.code === "P2002") {
            // Already migrated — skip silently
            continue;
          }
          stats.errors.push(`Fee ${fee.id}: ${err.message ?? String(err)}`);
        }
      }
    });
  } catch (err: any) {
    // Transaction-level failure — log all fees in batch as errored
    for (const fee of fees) {
      stats.errors.push(`Fee ${fee.id} (batch tx failed): ${err.message ?? String(err)}`);
    }
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal migration error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
