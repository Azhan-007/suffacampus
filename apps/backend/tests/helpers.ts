/**
 * Shared test helpers and factories for SuffaCampus backend tests.
 */

import { resetFirestoreMock, seedDoc, getDoc, getAllDocs } from "./__mocks__/firebase-admin";

// Re-export mock helpers for convenience
export { resetFirestoreMock, seedDoc, getDoc, getAllDocs };

// ---------------------------------------------------------------------------
// Factory functions â€” create valid test data with minimal boilerplate
// ---------------------------------------------------------------------------

let counter = 0;
function nextId(prefix = "test"): string {
  return `${prefix}_${++counter}`;
}

export function resetIdCounter(): void {
  counter = 0;
}

export function buildSchool(overrides: Record<string, unknown> = {}): {
  id: string;
  data: Record<string, unknown>;
} {
  const id = nextId("school");
  return {
    id,
    data: {
      name: `Test School ${id}`,
      code: `TS${id}`,
      subscriptionPlan: "Pro",
      subscriptionStatus: "active",
      autoRenew: true,
      trialEndDate: null,
      currentPeriodStart: { toMillis: () => Date.now() - 30 * 86400000 },
      currentPeriodEnd: { toMillis: () => Date.now() + 30 * 86400000 },
      paymentFailureCount: 0,
      limits: {
        students: 500,
        maxStudents: 500,
        maxTeachers: 50,
        maxClasses: 20,
      },
      isDeleted: false,
      createdAt: { toMillis: () => Date.now() },
      updatedAt: { toMillis: () => Date.now() },
      ...overrides,
    },
  };
}

export function buildUser(
  schoolId: string,
  role = "Admin",
  overrides: Record<string, unknown> = {}
): { uid: string; data: Record<string, unknown> } {
  const uid = nextId("user");
  return {
    uid,
    data: {
      uid,
      email: `${uid}@test.com`,
      displayName: `Test User ${uid}`,
      role,
      schoolId,
      status: "active",
      isDeleted: false,
      createdAt: { toMillis: () => Date.now() },
      ...overrides,
    },
  };
}

export function buildStudent(
  schoolId: string,
  overrides: Record<string, unknown> = {}
): { id: string; data: Record<string, unknown> } {
  const id = nextId("student");
  return {
    id,
    data: {
      id,
      schoolId,
      firstName: `Student`,
      lastName: id,
      name: `Student ${id}`,
      email: `${id}@student.test.com`,
      dateOfBirth: "2010-01-15",
      gender: "Male",
      classId: "10",
      section: "A",
      rollNumber: `${counter}`,
      admissionNumber: `ADM-${counter}`,
      status: "active",
      isDeleted: false,
      createdAt: { toMillis: () => Date.now() },
      updatedAt: { toMillis: () => Date.now() },
      ...overrides,
    },
  };
}

export function buildTeacher(
  schoolId: string,
  overrides: Record<string, unknown> = {}
): { id: string; data: Record<string, unknown> } {
  const id = nextId("teacher");
  return {
    id,
    data: {
      id,
      schoolId,
      firstName: `Teacher`,
      lastName: id,
      name: `Teacher ${id}`,
      email: `${id}@teacher.test.com`,
      subject: "Mathematics",
      qualification: "M.Sc.",
      phone: "+919876543210",
      status: "active",
      isDeleted: false,
      createdAt: { toMillis: () => Date.now() },
      updatedAt: { toMillis: () => Date.now() },
      ...overrides,
    },
  };
}

/**
 * Seed a school and its admin user, returning both IDs.
 */
export function seedSchoolWithAdmin(
  schoolOverrides: Record<string, unknown> = {},
  role = "Admin"
): { schoolId: string; userId: string } {
  const school = buildSchool(schoolOverrides);
  seedDoc("schools", school.id, school.data);

  const user = buildUser(school.id, role);
  seedDoc("users", user.uid, user.data);

  return { schoolId: school.id, userId: user.uid };
}

/**
 * Create a Firestore Timestamp-like object (for mock comparisons).
 */
export function fakeTimestamp(ms?: number): {
  toMillis: () => number;
  toDate: () => Date;
  seconds: number;
  nanoseconds: number;
} {
  const millis = ms ?? Date.now();
  return {
    toMillis: () => millis,
    toDate: () => new Date(millis),
    seconds: Math.floor(millis / 1000),
    nanoseconds: 0,
  };
}

