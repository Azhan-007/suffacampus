import { z } from "zod";

const optionalUrlWithAutoProtocol = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, z.string().url().optional());

const requiredEmail = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim();
}, z.string().email("Invalid email"));

const optionalEmail = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}, z.string().email("Invalid admin email").optional());

// ---------------------------------------------------------------------------
// Bulk attendance schema
// ---------------------------------------------------------------------------

export const AttendanceStatusExtended = z.enum(["Present", "Absent", "Late", "Excused"]);

export const bulkAttendanceEntrySchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  status: AttendanceStatusExtended,
  remarks: z.string().max(200).optional(),
});

export const bulkAttendanceSchema = z.object({
  classId: z.string().min(1, "Class ID is required"),
  sectionId: z.string().min(1, "Section ID is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  entries: z
    .array(bulkAttendanceEntrySchema)
    .min(1, "At least one attendance entry is required")
    .max(200, "Maximum 200 entries per bulk request"),
});

export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;
export type BulkAttendanceEntry = z.infer<typeof bulkAttendanceEntrySchema>;

// ---------------------------------------------------------------------------
// Admin school schemas
// ---------------------------------------------------------------------------

export const createSchoolSchema = z.object({
  name: z.string().min(1, "School name is required").max(200).trim(),
  code: z.string().min(1).max(50).trim().optional(), // auto-generated if omitted
  address: z.string().max(500).optional(),
  city: z.string().min(1, "City is required").max(100).trim(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  email: requiredEmail,
  website: optionalUrlWithAutoProtocol,
  principalName: z.string().max(200).optional(),
  logoURL: optionalUrlWithAutoProtocol,
  primaryColor: z.string().max(10).default("#1a73e8"),
  secondaryColor: z.string().max(10).default("#4285f4"),
  subscriptionPlan: z.enum(["free", "basic", "pro", "enterprise"]).default("free"),
  subscriptionStatus: z.enum(["active", "trial", "expired", "cancelled", "past_due"]).default("trial"),
  trialEndDate: z.string().optional(),
  maxStudents: z.number().int().min(1).default(50),
  maxTeachers: z.number().int().min(1).default(10),
  maxStorage: z.number().min(1).default(500), // MB
  timezone: z.string().max(50).default("Asia/Kolkata"),
  currency: z.string().max(5).default("INR"),
  dateFormat: z.string().max(20).default("DD/MM/YYYY"),
  currentSession: z.string().max(20).optional(),
  // Optional admin user creation — auto-creates an Admin account for this school
  adminEmail: optionalEmail,
  adminPassword: z.string().min(8, "Admin password must be at least 8 characters").optional(),
  adminDisplayName: z.string().min(1).max(200).trim().optional(),
  // Server-side fields (sent by frontend but handled by backend)
  subscriptionStartDate: z.string().optional(),
  subscriptionEndDate: z.string().optional(),
  isActive: z.boolean().optional(),
  createdBy: z.string().optional(),
});

export const updateSchoolSchema = createSchoolSchema.partial();

export type CreateSchoolInput = z.infer<typeof createSchoolSchema>;
export type UpdateSchoolAdminInput = z.infer<typeof updateSchoolSchema>;

// ---------------------------------------------------------------------------
// User management schemas
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Name is required").max(200).trim(),
  role: z.enum(["Admin", "Teacher", "Staff", "SuperAdmin"]),
  phone: z.string().max(20).optional(),
  photoURL: z.string().url().optional(),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(200).trim().optional(),
  role: z.enum(["Admin", "Teacher", "Staff", "SuperAdmin"]).optional(),
  phone: z.string().max(20).optional(),
  photoURL: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
