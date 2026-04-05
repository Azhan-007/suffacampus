import { z } from "zod";

export const Gender = z.enum(["Male", "Female", "Other"]);
export type Gender = z.infer<typeof Gender>;

export const createStudentSchema = z.object({
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  classId: z.string().min(1, "Class ID is required"),
  sectionId: z.string().min(1, "Section ID is required"),
  rollNumber: z.string().min(1, "Roll number is required"),
  parentPhone: z.string().min(1, "Parent phone is required"),
  gender: Gender,
  // Optional fields that the web panel may send
  photoURL: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  alternatePhone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.string().optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyRelation: z.string().optional(),
  medicalConditions: z.string().optional(),
  allergies: z.string().optional(),
  previousSchool: z.string().optional(),
  admissionDate: z.string().optional(),
  fatherName: z.string().optional(),
  fatherPhone: z.string().optional(),
  fatherEmail: z.string().optional(),
  fatherOccupation: z.string().optional(),
  fatherWorkplace: z.string().optional(),
  motherName: z.string().optional(),
  motherPhone: z.string().optional(),
  motherEmail: z.string().optional(),
  motherOccupation: z.string().optional(),
  motherWorkplace: z.string().optional(),
  guardianName: z.string().optional(),
  guardianRelation: z.string().optional(),
  guardianPhone: z.string().optional(),
  guardianEmail: z.string().optional(),
  parentEmail: z.string().optional(),
  enrollmentDate: z.string().optional(),
  isActive: z.boolean().optional(),
  studentId: z.string().optional(),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
