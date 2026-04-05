/**
 * Unit tests for Zod validation schemas.
 *
 * Ensures that create/update schemas correctly validate and reject
 * input payloads, protecting the API from malformed data.
 */

import { createStudentSchema } from "../../src/schemas/student.schema";
import { createTeacherSchema } from "../../src/schemas/teacher.schema";
import { markAttendanceSchema } from "../../src/schemas/attendance.schema";
import { updateStudentSchema, updateTeacherSchema } from "../../src/schemas/update.schema";

// ---------------------------------------------------------------------------
// Student schema
// ---------------------------------------------------------------------------

describe("createStudentSchema", () => {
  const validStudent = {
    firstName: "John",
    lastName: "Doe",
    classId: "10",
    sectionId: "A",
    rollNumber: "1",
    parentPhone: "+919876543210",
    gender: "Male" as const,
  };

  it("accepts a valid student payload", () => {
    const result = createStudentSchema.safeParse(validStudent);
    expect(result.success).toBe(true);
  });

  it("trims whitespace from firstName and lastName", () => {
    const result = createStudentSchema.safeParse({
      ...validStudent,
      firstName: "  John  ",
      lastName: "  Doe  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("John");
      expect(result.data.lastName).toBe("Doe");
    }
  });

  it("rejects missing firstName", () => {
    const { firstName, ...rest } = validStudent;
    const result = createStudentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = createStudentSchema.safeParse({
      ...validStudent,
      firstName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing lastName", () => {
    const { lastName, ...rest } = validStudent;
    const result = createStudentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing classId", () => {
    const { classId, ...rest } = validStudent;
    const result = createStudentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing rollNumber", () => {
    const { rollNumber, ...rest } = validStudent;
    const result = createStudentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing gender", () => {
    const { gender, ...rest } = validStudent;
    const result = createStudentSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid gender value", () => {
    const result = createStudentSchema.safeParse({
      ...validStudent,
      gender: "Unknown",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid gender values", () => {
    for (const g of ["Male", "Female", "Other"]) {
      const result = createStudentSchema.safeParse({
        ...validStudent,
        gender: g,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional fields when provided", () => {
    const result = createStudentSchema.safeParse({
      ...validStudent,
      email: "john@example.com",
      dateOfBirth: "2010-05-15",
      bloodGroup: "A+",
      address: "123 Main St",
    });
    expect(result.success).toBe(true);
  });

  it("rejects completely empty object", () => {
    const result = createStudentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Teacher schema
// ---------------------------------------------------------------------------

describe("createTeacherSchema", () => {
  const validTeacher = {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@school.com",
    department: "Mathematics",
    subjects: ["Math", "Statistics"],
  };

  it("accepts a valid teacher payload", () => {
    const result = createTeacherSchema.safeParse(validTeacher);
    expect(result.success).toBe(true);
  });

  it("normalizes email to lowercase", () => {
    const result = createTeacherSchema.safeParse({
      ...validTeacher,
      email: "JANE@SCHOOL.COM",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane@school.com");
    }
  });

  it("rejects invalid email format", () => {
    const result = createTeacherSchema.safeParse({
      ...validTeacher,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty subjects array", () => {
    const result = createTeacherSchema.safeParse({
      ...validTeacher,
      subjects: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing department", () => {
    const { department, ...rest } = validTeacher;
    const result = createTeacherSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("defaults isActive to true when omitted", () => {
    const result = createTeacherSchema.safeParse(validTeacher);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  it("allows setting isActive to false", () => {
    const result = createTeacherSchema.safeParse({
      ...validTeacher,
      isActive: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Update schemas (partial)
// ---------------------------------------------------------------------------

describe("updateStudentSchema", () => {
  it("accepts a partial update (firstName only)", () => {
    const result = updateStudentSchema.safeParse({ firstName: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object (no fields to update)", () => {
    const result = updateStudentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("still validates field types when present", () => {
    const result = updateStudentSchema.safeParse({ gender: "Invalid" });
    expect(result.success).toBe(false);
  });
});

describe("updateTeacherSchema", () => {
  it("accepts partial teacher update", () => {
    const result = updateTeacherSchema.safeParse({
      email: "new@school.com",
    });
    expect(result.success).toBe(true);
  });

  it("validates email when provided", () => {
    const result = updateTeacherSchema.safeParse({
      email: "not-valid",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Attendance schema
// ---------------------------------------------------------------------------

describe("markAttendanceSchema", () => {
  const validAttendance = {
    studentId: "student_1",
    date: "2026-02-23",
    status: "Present" as const,
    classId: "10",
    sectionId: "A",
  };

  it("accepts a valid attendance record", () => {
    const result = markAttendanceSchema.safeParse(validAttendance);
    expect(result.success).toBe(true);
  });

  it("accepts 'Absent' status", () => {
    const result = markAttendanceSchema.safeParse({
      ...validAttendance,
      status: "Absent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = markAttendanceSchema.safeParse({
      ...validAttendance,
      status: "Late",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = markAttendanceSchema.safeParse({
      ...validAttendance,
      date: "02/23/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects date without leading zeros", () => {
    const result = markAttendanceSchema.safeParse({
      ...validAttendance,
      date: "2026-2-3",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing studentId", () => {
    const { studentId, ...rest } = validAttendance;
    const result = markAttendanceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing classId", () => {
    const { classId, ...rest } = validAttendance;
    const result = markAttendanceSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});
