/**
 * CSV export service — generates CSV from PostgreSQL via Prisma.
 *
 * Uses cursor-batched async generators for O(batch) memory usage.
 * All exports stream directly to the HTTP response.
 */

import { prisma } from "../lib/prisma";
import { dateOnlyStringFrom, moneyToNumber } from "../utils/safe-fields";
import { assertSchoolScope } from "../lib/tenant-scope";

export interface ExportColumn {
  header: string;
  accessor: string | ((row: Record<string, unknown>) => string);
}

export interface ExportOptions {
  entity: string;
  schoolId: string;
  columns: ExportColumn[];
  filters?: Record<string, unknown>;
  limit?: number;
}

const STUDENT_COLUMNS: ExportColumn[] = [
  { header: "First Name", accessor: "firstName" },
  { header: "Last Name", accessor: "lastName" },
  { header: "Roll No.", accessor: "rollNumber" },
  { header: "Class", accessor: "className" },
  { header: "Gender", accessor: "gender" },
  { header: "Date of Birth", accessor: "dob" },
  { header: "Guardian", accessor: "guardianName" },
  { header: "Phone", accessor: "guardianPhone" },
  { header: "Email", accessor: "email" },
  { header: "Address", accessor: "address" },
];

const TEACHER_COLUMNS: ExportColumn[] = [
  { header: "First Name", accessor: "firstName" },
  { header: "Last Name", accessor: "lastName" },
  { header: "Email", accessor: "email" },
  { header: "Phone", accessor: "phone" },
  { header: "Department", accessor: "department" },
  { header: "Qualification", accessor: "qualification" },
  { header: "Joining Date", accessor: "joiningDate" },
];

const FEE_COLUMNS: ExportColumn[] = [
  { header: "Student Name", accessor: "studentName" },
  { header: "Fee Type", accessor: "feeType" },
  {
    header: "Amount",
    accessor: (row) => String(moneyToNumber(row.amount as any)),
  },
  {
    header: "Paid Amount",
    accessor: (row) => String(moneyToNumber(row.amountPaid as any)),
  },
  {
    header: "Due Date",
    accessor: (row) => dateOnlyStringFrom(row.dueDate as any),
  },
  { header: "Status", accessor: "status" },
  { header: "Payment Mode", accessor: "paymentMode" },
];

const ATTENDANCE_COLUMNS: ExportColumn[] = [
  { header: "Student Name", accessor: "studentName" },
  { header: "Date", accessor: "date" },
  { header: "Status", accessor: "status" },
  { header: "Remarks", accessor: "remarks" },
];

const RESULT_COLUMNS: ExportColumn[] = [
  { header: "Student Name", accessor: "studentName" },
  { header: "Exam Name", accessor: "examName" },
  { header: "Subject", accessor: "subject" },
  { header: "Marks Obtained", accessor: (row) => String(row.marksObtained ?? 0) },
  { header: "Total Marks", accessor: (row) => String(row.totalMarks ?? 0) },
  { header: "Percentage", accessor: (row) => String(row.percentage ?? 0) },
  { header: "Grade", accessor: "grade" },
];

export const EXPORT_TEMPLATES: Record<string, ExportColumn[]> = {
  students: STUDENT_COLUMNS,
  teachers: TEACHER_COLUMNS,
  fees: FEE_COLUMNS,
  attendance: ATTENDANCE_COLUMNS,
  results: RESULT_COLUMNS,
};

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsv(data: Record<string, unknown>, columns: ExportColumn[]): string {
  return columns
    .map((col) => {
      let value: string;
      if (typeof col.accessor === "function") {
        value = col.accessor(data);
      } else {
        const raw = data[col.accessor];
        value = raw === null || raw === undefined ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
      }
      return escapeCsvField(value);
    })
    .join(",");
}

// ---------------------------------------------------------------------------
// Cursor-batched query helper
// ---------------------------------------------------------------------------

const EXPORT_BATCH_SIZE = 500;

async function queryBatch(
  entity: string,
  where: any,
  take: number,
  cursor?: string
): Promise<Record<string, unknown>[]> {
  const cursorArgs = cursor ? { cursor: { id: cursor }, skip: 1 } : {};

  switch (entity) {
    case "students":
      return (await prisma.student.findMany({
        where: { ...where, isDeleted: false },
        take,
        orderBy: { id: "asc" },
        ...cursorArgs,
      })) as any;
    case "teachers":
      return (await prisma.teacher.findMany({
        where: { ...where, isDeleted: false },
        take,
        orderBy: { id: "asc" },
        ...cursorArgs,
      })) as any;
    case "fees":
      return (await prisma.fee.findMany({
        where,
        take,
        orderBy: { id: "asc" },
        ...cursorArgs,
      })) as any;
    case "attendance":
      return (await prisma.attendance.findMany({
        where,
        take,
        orderBy: { id: "asc" },
        ...cursorArgs,
      })) as any;
    case "results":
      return (await prisma.result.findMany({
        where: { ...where, isActive: true },
        take,
        orderBy: { id: "asc" },
        ...cursorArgs,
      })) as any;
    default:
      throw new Error(`Unknown export entity: ${entity}`);
  }
}

// ---------------------------------------------------------------------------
// Streaming export — cursor-batched async generator
// ---------------------------------------------------------------------------

/**
 * Async generator that yields CSV rows in batches.
 * Memory usage is O(EXPORT_BATCH_SIZE) regardless of total records.
 */
export async function* exportToCsvStream(options: ExportOptions): AsyncGenerator<string> {
  const { entity, schoolId, columns, filters, limit } = options;
  assertSchoolScope(schoolId);

  const where: any = { schoolId, ...filters };
  const maxRecords = limit ?? 100_000;

  // Yield header row
  yield columns.map((c) => escapeCsvField(c.header)).join(",") + "\n";

  let cursor: string | undefined;
  let yielded = 0;

  while (yielded < maxRecords) {
    const batchSize = Math.min(EXPORT_BATCH_SIZE, maxRecords - yielded);
    const batch = await queryBatch(entity, where, batchSize, cursor);

    if (batch.length === 0) break;

    for (const rec of batch) {
      yield rowToCsv(rec, columns) + "\n";
      yielded++;
    }

    cursor = (batch[batch.length - 1] as any).id;
    if (batch.length < batchSize) break;
  }
}


/**
 * Streaming version of exportByTemplate.
 * Returns an async generator yielding CSV rows.
 */
export function exportByTemplateStream(
  template: string,
  schoolId: string,
  filters?: Record<string, unknown>,
  limit?: number
): AsyncGenerator<string> {
  assertSchoolScope(schoolId);

  const columns = EXPORT_TEMPLATES[template];
  if (!columns) throw new Error(`Unknown export template: ${template}`);

  return exportToCsvStream({ entity: template, schoolId, columns, filters, limit });
}
