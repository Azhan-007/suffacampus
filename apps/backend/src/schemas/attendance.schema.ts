import { z } from "zod";

export const AttendanceStatus = z.enum(["Present", "Absent"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const markAttendanceSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  status: AttendanceStatus,
  classId: z.string().min(1, "Class ID is required"),
  sectionId: z.string().min(1, "Section ID is required"),
  studentName: z.string().optional(),
  remarks: z.string().optional(),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
