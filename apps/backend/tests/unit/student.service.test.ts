/**
 * Unit tests for student.service.ts
 *
 * Tests CRUD operations: create, list, get by ID, update, soft-delete.
 * Uses mocked Firebase Admin (Firestore, Auth).
 */

import {
  createStudent,
  getStudentById,
  updateStudent,
  softDeleteStudent,
} from "../../src/services/student.service";
import {
  auth,
  resetFirestoreMock,
} from "../__mocks__/firebase-admin";
import { resetIdCounter } from "../helpers";

const mockState = {
  schools: new Map<string, any>(),
  students: new Map<string, any>(),
  users: new Map<string, any>(),
  studentCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: jest.fn(async ({ where: { id } }) => {
        const school = mockState.schools.get(id);
        if (!school) return null;

        return {
          subscriptionPlan: school.subscriptionPlan,
          maxStudents: school.maxStudents,
          maxTeachers: school.maxTeachers,
        };
      }),
    },
    student: {
      count: jest.fn(async ({ where }) =>
        [...mockState.students.values()].filter(
          (student) =>
            student.schoolId === where.schoolId && student.isDeleted === where.isDeleted
        ).length
      ),
      create: jest.fn(async ({ data }) => {
        if (!mockState.schools.has(data.schoolId)) {
          throw new Error("Foreign key constraint violated: Student_schoolId_fkey");
        }
        const id = `st_${mockState.studentCounter++}`;
        const student = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.students.set(id, student);
        return student;
      }),
      findUnique: jest.fn(async ({ where: { id } }) => mockState.students.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.students.get(id);
        if (!existing) throw new Error("Student not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.students.set(id, updated);
        return updated;
      }),
    },
    user: {
      upsert: jest.fn(async ({ where: { uid }, update, create }) => {
        const existing = mockState.users.get(uid);
        const user = existing ? { ...existing, ...update } : create;
        mockState.users.set(uid, user);
        return user;
      }),
    },
  },
}));

function seedSchool(id: string) {
  mockState.schools.set(id, {
    id,
    name: "Test School",
    subscriptionPlan: "free",
    maxStudents: 200,
    maxTeachers: 20,
  });
}

function seedStudent(id: string, data: Record<string, unknown>) {
  mockState.students.set(id, {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  });
}

// Mock audit service
jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const mockCreateUser = auth.createUser as jest.Mock;
const mockGetUserByEmail = auth.getUserByEmail as jest.Mock;

beforeEach(() => {
  resetFirestoreMock();
  resetIdCounter();
  mockState.schools.clear();
  mockState.students.clear();
  mockState.users.clear();
  mockState.studentCounter = 1;
  seedSchool("school_1");
  mockCreateUser.mockReset();
  mockGetUserByEmail.mockReset();
  jest.clearAllMocks();
});

const validPayload = {
  firstName: "John",
  lastName: "Doe",
  classId: "10",
  sectionId: "A",
  rollNumber: "1",
  parentPhone: "+919876543210",
  gender: "Male" as const,
};

// ---------------------------------------------------------------------------
// createStudent
// ---------------------------------------------------------------------------

describe("createStudent", () => {
  beforeEach(() => {
    mockCreateUser.mockResolvedValue({ uid: "auth_student_1" });
  });

  it("creates a student document in Firestore", async () => {
    const result = await createStudent("school_1", validPayload, "admin_1");

    expect(result).toHaveProperty("id");
    expect(result.schoolId).toBe("school_1");
    expect(result.firstName).toBe("John");
    expect(result.lastName).toBe("Doe");
    expect(result.isDeleted).toBe(false);
  });

  it("returns Firebase Auth credentials", async () => {
    const result = await createStudent("school_1", validPayload, "admin_1");

    expect(result).toHaveProperty("credentials");
    expect(result.credentials).toHaveProperty("username");
    expect(result.credentials).toHaveProperty("email");
    expect(result.credentials).toHaveProperty("password");
    // Password is now randomly generated â€” just check it's a non-empty string
    expect(typeof result.credentials.password).toBe("string");
    expect(result.credentials.password.length).toBeGreaterThanOrEqual(8);
  });

  it("provisions a Firebase Auth account", async () => {
    await createStudent("school_1", validPayload, "admin_1");

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.stringContaining("school_1@SuffaCampus.internal"),
        password: expect.any(String),
        displayName: "John Doe",
      })
    );
  });

  it("creates a user doc in the users collection", async () => {
    await createStudent("school_1", validPayload, "admin_1");

    expect(mockState.users.size).toBe(1);
    const userDoc = [...mockState.users.values()][0];
    expect(userDoc.role).toBe("Student");
    expect(userDoc.schoolId).toBe("school_1");
  });

  it("handles auth email-already-exists by reusing existing uid", async () => {
    const authError = new Error("Email already exists") as any;
    authError.code = "auth/email-already-exists";
    mockCreateUser.mockRejectedValueOnce(authError);
    mockGetUserByEmail.mockResolvedValueOnce({ uid: "existing_uid" });

    const result = await createStudent("school_1", validPayload, "admin_1");
    expect(result).toHaveProperty("credentials");
    expect(mockGetUserByEmail).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getStudentById
// ---------------------------------------------------------------------------

describe("getStudentById", () => {
  it("returns student when found and belongs to same school", async () => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      isDeleted: false,
    });

    const result = await getStudentById("s1", "school_1");
    expect(result).not.toBeNull();
    expect(result?.firstName).toBe("John");
  });

  it("returns null for non-existent student", async () => {
    const result = await getStudentById("nonexistent", "school_1");
    expect(result).toBeNull();
  });

  it("returns null for student belonging to a different school (tenant isolation)", async () => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_2",
      firstName: "John",
      lastName: "Doe",
      isDeleted: false,
    });

    const result = await getStudentById("s1", "school_1");
    expect(result).toBeNull();
  });

  it("returns null for soft-deleted student", async () => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      isDeleted: true,
    });

    const result = await getStudentById("s1", "school_1");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateStudent
// ---------------------------------------------------------------------------

describe("updateStudent", () => {
  beforeEach(() => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      classId: "10",
      isDeleted: false,
    });
  });

  it("updates specified fields", async () => {
    const result = await updateStudent("s1", "school_1", { firstName: "Jane" }, "admin_1");
    expect(result.firstName).toBe("Jane");
    // lastName should be unchanged
    expect(result.lastName).toBe("Doe");
  });

  it("throws RESOURCE_NOT_FOUND for non-existent student", async () => {
    await expect(
      updateStudent("nonexistent", "school_1", { firstName: "Jane" }, "admin_1")
    ).rejects.toThrow(/not found/i);
  });

  it("throws TENANT_MISMATCH for wrong school", async () => {
    await expect(
      updateStudent("s1", "school_2", { firstName: "Jane" }, "admin_1")
    ).rejects.toThrow();
  });

  it("throws for soft-deleted student", async () => {
    seedStudent("s_del", {
      id: "s_del",
      schoolId: "school_1",
      firstName: "Deleted",
      lastName: "Person",
      isDeleted: true,
    });

    await expect(
      updateStudent("s_del", "school_1", { firstName: "Jane" }, "admin_1")
    ).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// softDeleteStudent
// ---------------------------------------------------------------------------

describe("softDeleteStudent", () => {
  it("soft-deletes a student by setting isDeleted=true", async () => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "John",
      isDeleted: false,
    });

    const result = await softDeleteStudent("s1", "school_1", "admin_1");
    expect(result).toBe(true);

    const updated = mockState.students.get("s1");
    expect(updated?.isDeleted).toBe(true);
    expect(updated?.deletedBy).toBe("admin_1");
  });

  it("returns false for non-existent student", async () => {
    const result = await softDeleteStudent("nonexistent", "school_1", "admin_1");
    expect(result).toBe(false);
  });

  it("returns false for student belonging to another school", async () => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_2",
      firstName: "John",
      isDeleted: false,
    });

    const result = await softDeleteStudent("s1", "school_1", "admin_1");
    expect(result).toBe(false);
  });

  it("returns false for already deleted student", async () => {
    seedStudent("s1", {
      id: "s1",
      schoolId: "school_1",
      firstName: "John",
      isDeleted: true,
    });

    const result = await softDeleteStudent("s1", "school_1", "admin_1");
    expect(result).toBe(false);
  });
});

