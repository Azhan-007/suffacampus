/**
 * Unit tests for lib/schemas.ts
 * Covers all 7 Zod schemas and the validateFormData helper.
 */

import {
  studentSchema,
  teacherSchema,
  feeSchema,
  eventSchema,
  resultSchema,
  bookSchema,
  timetableSchema,
  validateFormData,
} from '@/lib/schemas';

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal valid student form data */
const validStudent = {
  studentId: 'STU001',
  firstName: 'Alice',
  lastName: 'Smith',
  email: '',
  phone: '',
  parentPhone: '1234567890',
  parentEmail: '',
  classId: 'c1',
  sectionId: 'sec-a',
  rollNumber: '001',
  dateOfBirth: '2010-01-15',
  gender: 'Female',
  address: '123 Main St',
};

const validTeacher = {
  teacherId: 'TCH001',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@school.com',
  phone: '9876543210',
  subjects: ['Math'],
  department: 'Science',
  joiningDate: '2024-01-01',
  gender: 'Male',
};

const validFee = {
  studentName: 'Alice Smith',
  amount: 5000,
  dueDate: '2025-06-01',
  feeType: 'Tuition',
};

const validEvent = {
  title: 'Annual Day',
  eventDate: '2025-12-15',
  eventType: 'Cultural',
};

const validResult = {
  studentName: 'Alice Smith',
  classId: 'c1',
  examType: 'Final',
  subject: 'Math',
  marksObtained: 85,
  totalMarks: 100,
};

const validBook = {
  title: 'Physics 101',
  author: 'Dr Smith',
  category: 'Science',
  totalCopies: 10,
};

const validTimetable = {
  classId: 'c1',
  day: 'Monday',
  periods: [{ periodNumber: 1, subject: 'Math' }],
};

// ═════════════════════════════════════════════════════════════════════

describe('studentSchema', () => {
  it('accepts valid data', () => {
    const result = studentSchema.safeParse(validStudent);
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = studentSchema.safeParse(validStudent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
      expect(result.data.photoURL).toBe('');
    }
  });

  it('rejects missing firstName', () => {
    const result = studentSchema.safeParse({ ...validStudent, firstName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid parentPhone', () => {
    const result = studentSchema.safeParse({ ...validStudent, parentPhone: 'abc' });
    expect(result.success).toBe(false);
  });

  it('accepts valid email', () => {
    const result = studentSchema.safeParse({ ...validStudent, email: 'alice@test.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = studentSchema.safeParse({ ...validStudent, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('allows empty email (optional)', () => {
    const result = studentSchema.safeParse({ ...validStudent, email: '' });
    expect(result.success).toBe(true);
  });
});

describe('teacherSchema', () => {
  it('accepts valid data', () => {
    const result = teacherSchema.safeParse(validTeacher);
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = teacherSchema.safeParse({ ...validTeacher, email: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = teacherSchema.safeParse({ ...validTeacher, email: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects empty subjects array', () => {
    const result = teacherSchema.safeParse({ ...validTeacher, subjects: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid phone', () => {
    const result = teacherSchema.safeParse({ ...validTeacher, phone: 'abc' });
    expect(result.success).toBe(false);
  });
});

describe('feeSchema', () => {
  it('accepts valid data', () => {
    const result = feeSchema.safeParse(validFee);
    expect(result.success).toBe(true);
  });

  it('applies default amountPaid = 0', () => {
    const result = feeSchema.safeParse(validFee);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amountPaid).toBe(0);
    }
  });

  it('rejects zero amount', () => {
    const result = feeSchema.safeParse({ ...validFee, amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = feeSchema.safeParse({ ...validFee, amount: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects missing studentName', () => {
    const result = feeSchema.safeParse({ ...validFee, studentName: '' });
    expect(result.success).toBe(false);
  });
});

describe('eventSchema', () => {
  it('accepts valid data', () => {
    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it('defaults targetAudience to empty array', () => {
    const result = eventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetAudience).toEqual([]);
    }
  });

  it('rejects missing title', () => {
    const result = eventSchema.safeParse({ ...validEvent, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing eventDate', () => {
    const result = eventSchema.safeParse({ ...validEvent, eventDate: '' });
    expect(result.success).toBe(false);
  });
});

describe('resultSchema', () => {
  it('accepts valid data', () => {
    const result = resultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it('rejects marksObtained > totalMarks', () => {
    const result = resultSchema.safeParse({ ...validResult, marksObtained: 110, totalMarks: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message.includes('cannot exceed'))).toBe(true);
    }
  });

  it('rejects negative marksObtained', () => {
    const result = resultSchema.safeParse({ ...validResult, marksObtained: -5 });
    expect(result.success).toBe(false);
  });

  it('rejects zero totalMarks', () => {
    const result = resultSchema.safeParse({ ...validResult, totalMarks: 0 });
    expect(result.success).toBe(false);
  });

  it('allows marksObtained = totalMarks', () => {
    const result = resultSchema.safeParse({ ...validResult, marksObtained: 100, totalMarks: 100 });
    expect(result.success).toBe(true);
  });

  it('allows marksObtained = 0', () => {
    const result = resultSchema.safeParse({ ...validResult, marksObtained: 0 });
    expect(result.success).toBe(true);
  });
});

describe('bookSchema', () => {
  it('accepts valid data', () => {
    const result = bookSchema.safeParse(validBook);
    expect(result.success).toBe(true);
  });

  it('rejects totalCopies < 1', () => {
    const result = bookSchema.safeParse({ ...validBook, totalCopies: 0 });
    expect(result.success).toBe(false);
  });

  it('defaults availableCopies to 0', () => {
    const result = bookSchema.safeParse(validBook);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.availableCopies).toBe(0);
    }
  });

  it('rejects missing title', () => {
    const result = bookSchema.safeParse({ ...validBook, title: '' });
    expect(result.success).toBe(false);
  });
});

describe('timetableSchema', () => {
  it('accepts valid data', () => {
    const result = timetableSchema.safeParse(validTimetable);
    expect(result.success).toBe(true);
  });

  it('rejects empty periods', () => {
    const result = timetableSchema.safeParse({ ...validTimetable, periods: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing day', () => {
    const result = timetableSchema.safeParse({ ...validTimetable, day: '' });
    expect(result.success).toBe(false);
  });

  it('applies period defaults (startTime, endTime)', () => {
    const result = timetableSchema.safeParse(validTimetable);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.periods[0].startTime).toBe('08:00');
      expect(result.data.periods[0].endTime).toBe('08:45');
    }
  });
});

// ── validateFormData helper ──────────────────────────────────────────

describe('validateFormData', () => {
  it('returns null for valid data', () => {
    const errors = validateFormData(studentSchema, validStudent);
    expect(errors).toBeNull();
  });

  it('returns flat error map for invalid data', () => {
    const errors = validateFormData(studentSchema, { ...validStudent, firstName: '', lastName: '' });
    expect(errors).not.toBeNull();
    expect(errors!['firstName']).toBeDefined();
    expect(errors!['lastName']).toBeDefined();
  });

  it('only keeps first error per field', () => {
    // parentPhone empty → fails both min(1) and regex. Only first message kept.
    const errors = validateFormData(studentSchema, { ...validStudent, parentPhone: '' });
    expect(errors).not.toBeNull();
    expect(typeof errors!['parentPhone']).toBe('string');
  });

  it('works with refine schemas (resultSchema)', () => {
    const errors = validateFormData(resultSchema, { ...validResult, marksObtained: 200, totalMarks: 100 });
    expect(errors).not.toBeNull();
    expect(errors!['marksObtained']).toContain('cannot exceed');
  });
});
