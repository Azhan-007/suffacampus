import { z } from "zod";

export const classAssignmentSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.string().min(1),
  className: z.string().optional(),
  sectionName: z.string().optional(),
});

export type ClassAssignment = z.infer<typeof classAssignmentSchema>;

export const createTeacherSchema = z.object({
  teacherId: z.string().trim().optional(),
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  email: z.string().email("Invalid email address").trim().toLowerCase(),
  phone: z.string().trim().optional(),
  department: z.string().min(1, "Department is required").trim(),
  subjects: z.array(z.string().min(1)).min(1, "At least one subject is required"),
  assignedClasses: z.array(classAssignmentSchema).default([]),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  address: z.string().trim().optional(),
  // Accept both HTTPS image URLs and data URLs from client-side uploads.
  photoURL: z.string().min(1).optional(),
  joiningDate: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;
