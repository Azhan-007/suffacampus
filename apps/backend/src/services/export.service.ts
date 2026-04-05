/**
 * CSV export service — generates CSV from PostgreSQL via Prisma.
 */

import { prisma } from "../lib/prisma";

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
  { header: "Amount", accessor: (row) => String(row.amount ?? 0) },
  { header: "Paid Amount", accessor: (row) => String(row.amountPaid ?? 0) },
  { header: "Due Date", accessor: "dueDate" },
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

/**
 * Export data to CSV using Prisma queries.
 */
export async function exportToCsv(options: ExportOptions): Promise<string> {
  const { entity, schoolId, columns, filters, limit } = options;
  let records: Record<string, unknown>[];

  const where: any = { schoolId, ...filters };
  const take = limit ?? 10000;

  switch (entity) {
    case "students":
      records = await prisma.student.findMany({ where: { ...where, isDeleted: false }, take }) as any;
      break;
    case "teachers":
      records = await prisma.teacher.findMany({ where: { ...where, isDeleted: false }, take }) as any;
      break;
    case "fees":
      records = await prisma.fee.findMany({ where, take }) as any;
      break;
    case "attendance":
      records = await prisma.attendance.findMany({ where, take }) as any;
      break;
    case "results":
      records = await prisma.result.findMany({ where: { ...where, isActive: true }, take }) as any;
      break;
    default:
      throw new Error(`Unknown export entity: ${entity}`);
  }

  const header = columns.map((c) => escapeCsvField(c.header)).join(",");
  const rows = records.map((rec) => rowToCsv(rec, columns));

  return [header, ...rows].join("\n");
}

export async function exportByTemplate(
  template: string,
  schoolId: string,
  filters?: Record<string, unknown>,
  limit?: number
): Promise<string> {
  const columns = EXPORT_TEMPLATES[template];
  if (!columns) throw new Error(`Unknown export template: ${template}`);

  return exportToCsv({ entity: template, schoolId, columns, filters, limit });
}
