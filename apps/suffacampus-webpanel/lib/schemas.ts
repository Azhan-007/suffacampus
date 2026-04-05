import { z } from 'zod';

// ─── Reusable validators ────────────────────────────────────────────────────

const requiredString = (label: string) =>
  z.string().min(1, `${label} is required`);

const optionalString = z.string().optional().default('');

const emailField = z
  .string()
  .email('Enter a valid email address')
  .or(z.literal(''));

const phoneField = z
  .string()
  .regex(/^[\d+\-() ]{7,15}$/, 'Enter a valid phone number')
  .or(z.literal(''));

const requiredPhone = (label: string) =>
  z.string().min(1, `${label} is required`).regex(/^[\d+\-() ]{7,15}$/, 'Enter a valid phone number');

const dateString = (label: string) =>
  z.string().min(1, `${label} is required`);

// ─── Student Schema ─────────────────────────────────────────────────────────

export const studentSchema = z.object({
  studentId: requiredString('Student ID'),
  firstName: requiredString('First name'),
  lastName: requiredString('Last name'),
  email: emailField,
  phone: phoneField,
  parentPhone: requiredPhone('Parent phone'),
  parentEmail: emailField,
  classId: requiredString('Class'),
  sectionId: requiredString('Section'),
  rollNumber: requiredString('Roll number'),
  dateOfBirth: dateString('Date of birth'),
  gender: z.string().default('Male'),
  address: requiredString('Address'),
  photoURL: optionalString,
  enrollmentDate: z.string().default(() => new Date().toISOString().split('T')[0]),
  isActive: z.boolean().default(true),
});

export type StudentFormData = z.infer<typeof studentSchema>;

// ─── Teacher Schema ─────────────────────────────────────────────────────────

export const teacherSchema = z.object({
  teacherId: requiredString('Teacher ID'),
  firstName: requiredString('First name'),
  lastName: requiredString('Last name'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  phone: requiredPhone('Phone'),
  subjects: z.array(z.string()).min(1, 'At least one subject is required'),
  department: requiredString('Department'),
  joiningDate: dateString('Joining date'),
  gender: z.string().default('Male'),
  address: optionalString,
  photoURL: optionalString,
  isActive: z.boolean().default(true),
});

export type TeacherFormData = z.infer<typeof teacherSchema>;

// ─── Fee Schema ─────────────────────────────────────────────────────────────

export const feeSchema = z.object({
  studentId: optionalString,
  studentName: requiredString('Student name'),
  classId: optionalString,
  sectionId: optionalString,
  amount: z.number().positive('Amount must be greater than 0'),
  dueDate: dateString('Due date'),
  status: z.string().default('Pending'),
  paymentMode: optionalString,
  transactionId: optionalString,
  feeType: requiredString('Fee type'),
  amountPaid: z.number().min(0).default(0),
  paidDate: optionalString,
  remarks: optionalString,
});

export type FeeFormData = z.infer<typeof feeSchema>;

// ─── Event Schema ───────────────────────────────────────────────────────────

export const eventSchema = z.object({
  title: requiredString('Title'),
  description: optionalString,
  eventDate: dateString('Event date'),
  endDate: optionalString,
  eventType: requiredString('Event type'),
  targetAudience: z.array(z.string()).default([]),
  location: optionalString,
  organizer: optionalString,
  isActive: z.boolean().default(true),
});

export type EventFormData = z.infer<typeof eventSchema>;

// ─── Result Schema ──────────────────────────────────────────────────────────

export const resultSchema = z
  .object({
    studentId: optionalString,
    studentName: requiredString('Student name'),
    rollNumber: optionalString,
    classId: requiredString('Class'),
    sectionId: optionalString,
    className: optionalString,
    examType: requiredString('Exam type'),
    examName: optionalString,
    subject: requiredString('Subject'),
    marksObtained: z.number().min(0, 'Cannot be negative'),
    totalMarks: z.number().positive('Total marks must be greater than 0'),
    percentage: z.number().default(0),
    grade: optionalString,
    status: z.string().default('Pass'),
    rank: z.number().optional(),
    remarks: optionalString,
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.marksObtained <= d.totalMarks, {
    message: 'Marks obtained cannot exceed total marks',
    path: ['marksObtained'],
  });

export type ResultFormData = z.infer<typeof resultSchema>;

// ─── Library (Book) Schema ──────────────────────────────────────────────────

export const bookSchema = z.object({
  title: requiredString('Title'),
  author: requiredString('Author'),
  category: requiredString('Category'),
  isbn: optionalString,
  totalCopies: z.number().min(1, 'At least 1 copy required'),
  availableCopies: z.number().min(0).default(0),
  publishedYear: optionalString,
  publisher: optionalString,
  description: optionalString,
  isActive: z.boolean().default(true),
});

export type BookFormData = z.infer<typeof bookSchema>;

// ─── Timetable Schema ──────────────────────────────────────────────────────

const periodSchema = z.object({
  periodNumber: z.number(),
  subject: requiredString('Subject'),
  teacherId: optionalString,
  teacherName: optionalString,
  startTime: z.string().default('08:00'),
  endTime: z.string().default('08:45'),
  roomNumber: optionalString,
});

export const timetableSchema = z.object({
  classId: requiredString('Class'),
  sectionId: optionalString,
  className: optionalString,
  day: requiredString('Day'),
  isActive: z.boolean().default(true),
  periods: z
    .array(periodSchema)
    .min(1, 'At least 1 period required'),
});

export type TimetableFormData = z.infer<typeof timetableSchema>;

// ─── Validation helper ─────────────────────────────────────────────────────

/**
 * Validate form data against a Zod schema and return a flat error map.
 * Returns `null` when valid, otherwise `Record<string, string>`.
 */
export function validateFormData<T>(
  schema: z.ZodType<T>,
  data: unknown,
): Record<string, string> | null {
  const result = schema.safeParse(data);
  if (result.success) return null;

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
