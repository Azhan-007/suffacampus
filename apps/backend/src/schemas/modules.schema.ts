import { z } from "zod";

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export const sectionSchema = z.object({
  id: z.string().optional(), // auto-generated if not provided
  sectionName: z.string().min(1, "Section name is required").trim(),
  capacity: z.number().int().positive("Capacity must be positive"),
  teacherId: z.string().optional(),
  teacherName: z.string().optional(),
});

export const createClassSchema = z.object({
  className: z.string().min(1, "Class name is required").trim(),
  grade: z.number().int().min(1).max(12),
  sections: z.array(sectionSchema).min(1, "At least one section is required"),
  capacity: z.number().int().positive("Capacity must be positive"),
  isActive: z.boolean().default(true),
});

export const updateClassSchema = createClassSchema.partial();

export const addSectionSchema = sectionSchema;

export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type SectionInput = z.infer<typeof sectionSchema>;

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

export const createEventSchema = z.object({
  title: z.string().min(1, "Title is required").max(200).trim(),
  description: z.string().min(1, "Description is required").max(2000).trim(),
  eventDate: z.string().min(1, "Event date is required"),
  endDate: z.string().optional(),
  eventType: z.enum(["Holiday", "Exam", "Sports", "Cultural", "Meeting", "Other"]),
  targetAudience: z.array(z.string()).min(1, "Target audience is required"),
  location: z.string().max(200).optional(),
  organizer: z.string().max(200).optional(),
  imageURL: z.string().url().optional(),
  isActive: z.boolean().default(true),
});

export const updateEventSchema = createEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ---------------------------------------------------------------------------
// Fee
// ---------------------------------------------------------------------------

export const createFeeSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  studentName: z.string().min(1, "Student name is required").trim(),
  classId: z.string().min(1, "Class ID is required"),
  sectionId: z.string().min(1, "Section ID is required"),
  amount: z.number().positive("Amount must be positive"),
  dueDate: z.string().min(1, "Due date is required"),
  paidDate: z.string().optional(),
  status: z.enum(["Pending", "Paid", "Overdue", "Partial"]).default("Pending"),
  paymentMode: z.string().optional(),
  transactionId: z.string().optional(),
  feeType: z.string().min(1, "Fee type is required").trim(),
  amountPaid: z.number().min(0).optional(),
  remarks: z.string().max(500).optional(),
});

export const updateFeeSchema = createFeeSchema.partial();

export type CreateFeeInput = z.infer<typeof createFeeSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeSchema>;

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export const createBookSchema = z.object({
  title: z.string().min(1, "Title is required").max(300).trim(),
  author: z.string().min(1, "Author is required").max(200).trim(),
  category: z.string().min(1, "Category is required").trim(),
  isbn: z.string().min(1, "ISBN is required").trim(),
  totalCopies: z.number().int().positive("Total copies must be positive"),
  availableCopies: z.number().int().min(0).optional(),
  publishedYear: z.number().int().min(1800).max(2030).optional(),
  publisher: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  coverImageURL: z.string().url().optional(),
  isActive: z.boolean().default(true),
});

export const updateBookSchema = createBookSchema.partial();

export const libraryTransactionSchema = z.object({
  bookId: z.string().min(1, "Book ID is required"),
  studentId: z.string().min(1, "Student ID is required"),
  issueDate: z.string().min(1, "Issue date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  returnDate: z.string().optional(),
  status: z.enum(["Issued", "Returned", "Overdue"]).default("Issued"),
  fine: z.number().min(0).optional(),
});

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type LibraryTransactionInput = z.infer<typeof libraryTransactionSchema>;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export const createResultSchema = z.object({
  studentId: z.string().min(1, "Student ID is required"),
  studentName: z.string().min(1, "Student name is required").trim(),
  rollNumber: z.string().min(1, "Roll number is required"),
  classId: z.string().min(1, "Class ID is required"),
  sectionId: z.string().min(1, "Section ID is required"),
  className: z.string().optional(),
  examType: z.string().min(1, "Exam type is required"),
  examName: z.string().min(1, "Exam name is required").trim(),
  subject: z.string().min(1, "Subject is required").trim(),
  marksObtained: z.number().min(0, "Marks must be non-negative"),
  totalMarks: z.number().positive("Total marks must be positive"),
  percentage: z.number().min(0).max(100).optional(), // auto-calculated if omitted
  grade: z.string().optional(),    // auto-calculated if omitted
  status: z.enum(["Pass", "Fail"]).optional(), // auto-calculated if omitted
  rank: z.number().int().positive().optional(),
  remarks: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  published: z.boolean().default(false),
});

export const updateResultSchema = createResultSchema.partial();

export type CreateResultInput = z.infer<typeof createResultSchema>;
export type UpdateResultInput = z.infer<typeof updateResultSchema>;

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

export const periodSchema = z.object({
  periodNumber: z.number().int().positive(),
  subject: z.string().min(1, "Subject is required").trim(),
  teacherId: z.string().min(1, "Teacher ID is required"),
  teacherName: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  roomNumber: z.string().optional(),
});

export const createTimetableSchema = z.object({
  classId: z.string().min(1, "Class ID is required"),
  sectionId: z.string().min(1, "Section ID is required"),
  className: z.string().optional(),
  day: z.string().min(1, "Day is required"),
  periods: z.array(periodSchema).min(1, "At least one period is required"),
  isActive: z.boolean().default(true),
});

export const updateTimetableSchema = createTimetableSchema.partial();

export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;
export type UpdateTimetableInput = z.infer<typeof updateTimetableSchema>;
export type PeriodInput = z.infer<typeof periodSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const updateSettingsSchema = z.object({
  schoolName: z.string().min(1).max(200).trim().optional(),
  schoolCode: z.string().min(1).max(50).trim().optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  logoURL: z.string().url().optional(),
  primaryColor: z.string().max(10).optional(),
  secondaryColor: z.string().max(10).optional(),
  currentSession: z.string().max(20).optional(),
  sessionStartMonth: z.number().int().min(1).max(12).optional(),
  sessionEndMonth: z.number().int().min(1).max(12).optional(),
  currency: z.string().max(5).optional(),
  dateFormat: z.string().max(20).optional(),
  timeFormat: z.string().max(5).optional(),
  timezone: z.string().max(50).optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
