/**
 * Bulk import service — CSV/JSON parsing, validation, and batch insert via Prisma.
 */

import { prisma } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { z } from "zod";

export interface ImportError { row: number; field?: string; message: string; }
export interface ImportResult { total: number; imported: number; skipped: number; errors: ImportError[]; createdIds: string[]; }

type EntityType = "students" | "teachers" | "fees" | "attendance";

// CSV Parser
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) { row[headers[j]] = (values[j] ?? "").trim(); }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []; let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) { if (char === '"') { if (line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = false; } } else { current += char; } }
    else { if (char === '"') { inQuotes = true; } else if (char === ",") { result.push(current); current = ""; } else { current += char; } }
  }
  result.push(current);
  return result;
}

// Validation schemas
const studentImportSchema = z.object({ firstName: z.string().min(1), lastName: z.string().min(1), dateOfBirth: z.string().min(1), gender: z.enum(["male", "female", "other"]), classId: z.string().optional(), className: z.string().optional(), sectionId: z.string().optional(), rollNumber: z.string().optional(), guardianName: z.string().min(1), guardianPhone: z.string().min(10), guardianEmail: z.string().email().optional().or(z.literal("")), address: z.string().optional(), bloodGroup: z.string().optional(), admissionDate: z.string().optional() });
const teacherImportSchema = z.object({ firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().email(), phone: z.string().min(10), department: z.string().optional(), subject: z.string().optional(), qualification: z.string().optional(), dateOfBirth: z.string().optional(), gender: z.enum(["male", "female", "other"]).optional(), address: z.string().optional(), joiningDate: z.string().optional() });
const feeImportSchema = z.object({ studentId: z.string().min(1), feeType: z.string().min(1), amount: z.string().min(1).transform(Number), dueDate: z.string().min(1), description: z.string().optional(), status: z.enum(["pending", "paid", "overdue", "partial"]).optional() });
const attendanceImportSchema = z.object({ studentId: z.string().min(1), date: z.string().min(1), status: z.enum(["present", "absent", "late", "excused"]), remarks: z.string().optional() });

const schemas: Record<EntityType, z.ZodSchema> = { students: studentImportSchema, teachers: teacherImportSchema, fees: feeImportSchema, attendance: attendanceImportSchema };

export async function bulkImport(params: { entityType: EntityType; schoolId: string; userId: string; rows: Record<string, unknown>[]; skipInvalid?: boolean; }): Promise<ImportResult> {
  const { entityType, schoolId, userId, rows, skipInvalid = true } = params;
  const schema = schemas[entityType];
  if (!schema) return { total: rows.length, imported: 0, skipped: rows.length, errors: [{ row: 0, message: `Unknown entity type: ${entityType}` }], createdIds: [] };

  // Validate
  const validRows: { index: number; data: Record<string, unknown> }[] = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = schema.safeParse(rows[i]);
    if (result.success) {
      validRows.push({ index: i + 1, data: result.data as Record<string, unknown> });
    } else {
      for (const issue of result.error.issues) {
        errors.push({ row: i + 1, field: issue.path.join("."), message: issue.message });
      }
      if (!skipInvalid) return { total: rows.length, imported: 0, skipped: rows.length, errors, createdIds: [] };
    }
  }

  if (validRows.length === 0) return { total: rows.length, imported: 0, skipped: rows.length, errors, createdIds: [] };

  // Batch insert via Prisma
  const createdIds: string[] = [];

  for (const row of validRows) {
    try {
      let record: any;
      switch (entityType) {
        case "students":
          record = await prisma.student.create({ data: { ...row.data as any, schoolId, isDeleted: false } });
          break;
        case "teachers":
          record = await prisma.teacher.create({ data: { ...row.data as any, schoolId, isDeleted: false } });
          break;
        case "fees":
          record = await prisma.fee.create({ data: { ...row.data as any, schoolId } });
          break;
        case "attendance":
          record = await prisma.attendance.create({ data: { ...row.data as any, schoolId, markedBy: userId } });
          break;
      }
      if (record?.id) createdIds.push(record.id);
    } catch (err: any) {
      errors.push({ row: row.index, message: err.message ?? "Database insert failed" });
    }
  }

  await writeAuditLog(`BULK_IMPORT_${entityType.toUpperCase()}`, userId, schoolId, {
    totalRows: rows.length, imported: createdIds.length, skipped: rows.length - createdIds.length, errorCount: errors.length,
  });

  return { total: rows.length, imported: createdIds.length, skipped: rows.length - createdIds.length, errors, createdIds };
}

export function getImportTemplate(entityType: EntityType): string {
  const templates: Record<EntityType, string[]> = {
    students: ["firstName", "lastName", "dateOfBirth", "gender", "className", "rollNumber", "guardianName", "guardianPhone", "guardianEmail", "address", "bloodGroup", "admissionDate"],
    teachers: ["firstName", "lastName", "email", "phone", "department", "subject", "qualification", "dateOfBirth", "gender", "address", "joiningDate"],
    fees: ["studentId", "feeType", "amount", "dueDate", "description", "status"],
    attendance: ["studentId", "date", "status", "remarks"],
  };
  return templates[entityType]?.join(",") ?? "";
}
