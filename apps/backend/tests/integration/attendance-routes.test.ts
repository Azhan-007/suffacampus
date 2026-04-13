/**
 * Integration tests for attendance routes.
 *
 * Tests: POST /attendance (single), GET /attendance?date=,
 *        POST /attendance/bulk, GET /attendance/stats
 */

import Fastify, { type FastifyInstance } from "fastify";
import attendanceRoutes from "../../src/routes/v1/attendance";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  students: new Map<string, any>(),
  attendance: new Map<string, any>(),
  attendanceCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    student: {
      findUnique: jest.fn(async ({ where: { id }, select }) => {
        const row = mockState.students.get(id) ?? null;
        if (!row) return null;
        if (!select) return row;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = row[key];
        }
        return selected;
      }),
    },
    attendance: {
      findUnique: jest.fn(async ({ where }) => {
        if (where?.id) return mockState.attendance.get(where.id) ?? null;
        if (where?.schoolId_studentId_date) {
          const key = where.schoolId_studentId_date;
          return [...mockState.attendance.values()].find(
            (a) => a.schoolId === key.schoolId && a.studentId === key.studentId && a.date === key.date
          ) ?? null;
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => {
        const id = `att_${mockState.attendanceCounter++}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
        mockState.attendance.set(id, row);
        return row;
      }),
      createMany: jest.fn(async ({ data }) => {
        let count = 0;
        for (const rowData of data as Array<Record<string, unknown>>) {
          const id = `att_${mockState.attendanceCounter++}`;
          const row = { id, createdAt: new Date(), updatedAt: new Date(), ...rowData };
          mockState.attendance.set(id, row);
          count += 1;
        }
        return { count };
      }),
      findMany: jest.fn(async ({ where, orderBy }) => {
        let rows = [...mockState.attendance.values()].filter((a) => {
          if (where?.schoolId && a.schoolId !== where.schoolId) return false;
          if (where?.studentId && typeof where.studentId === "string" && a.studentId !== where.studentId) return false;
          if (where?.studentId?.in && Array.isArray(where.studentId.in) && !where.studentId.in.includes(a.studentId)) return false;
          if (where?.date) {
            if (where.date instanceof Date) {
              if (new Date(a.date).getTime() !== where.date.getTime()) return false;
            } else if (typeof where.date === "object") {
              const recordDate = new Date(a.date);
              if (where.date.gte && recordDate < new Date(where.date.gte)) return false;
              if (where.date.lte && recordDate > new Date(where.date.lte)) return false;
            } else if (a.date !== where.date) {
              return false;
            }
          }
          if (where?.classId && a.classId !== where.classId) return false;
          if (where?.sectionId && a.sectionId !== where.sectionId) return false;
          if (where?.status?.in && Array.isArray(where.status.in) && !where.status.in.includes(a.status)) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "studentName";
        const sortOrder = (orderBy?.[sortBy] ?? "asc") as "asc" | "desc";
        rows = rows.sort((x, y) => {
          const lhs = x[sortBy];
          const rhs = y[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });
        return rows;
      }),
      groupBy: jest.fn(async ({ where }) => {
        const rows = [...mockState.attendance.values()].filter((a) => {
          if (where?.schoolId && a.schoolId !== where.schoolId) return false;
          if (where?.classId && a.classId !== where.classId) return false;
          if (where?.sectionId && a.sectionId !== where.sectionId) return false;
          if (where?.date) {
            const recordDate = new Date(a.date);
            if (where.date.gte && recordDate < new Date(where.date.gte)) return false;
            if (where.date.lte && recordDate > new Date(where.date.lte)) return false;
          }
          return true;
        });

        const counts = new Map<string, number>();
        for (const row of rows) {
          const status = String(row.status);
          counts.set(status, (counts.get(status) ?? 0) + 1);
        }

        return [...counts.entries()].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.attendance.get(id);
        if (!existing) throw new Error("Attendance not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.attendance.set(id, updated);
        return updated;
      }),
      delete: jest.fn(async ({ where: { id } }) => {
        const existing = mockState.attendance.get(id) ?? null;
        mockState.attendance.delete(id);
        return existing;
      }),
      count: jest.fn(async ({ where }) =>
        [...mockState.attendance.values()].filter((a) => {
          if (where?.schoolId && a.schoolId !== where.schoolId) return false;
          if (where?.studentId && a.studentId !== where.studentId) return false;
          if (where?.date?.gte && String(a.date) < String(where.date.gte)) return false;
          if (where?.status?.in && Array.isArray(where.status.in) && !where.status.in.includes(a.status)) return false;
          return true;
        }).length
      ),
    },
  },
}));

// Mock audit service
jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

// ---- helpers ----

function setupAuthUser(role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({
    uid: "user_1",
    email: "admin@school.com",
  });
  seedDoc("users", "user_1", {
    uid: "user_1",
    email: "admin@school.com",
    role,
    schoolId,
    status: "active",
  });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function seedStudent(id: string, schoolId = "school_1") {
  seedDoc("students", id, {
    id,
    schoolId,
    firstName: "Test",
    lastName: "Student",
    isDeleted: false,
  });
  mockState.students.set(id, {
    id,
    schoolId,
    isDeleted: false,
  });
}

function seedPrismaAttendance(id: string, data: Record<string, unknown>) {
  mockState.attendance.set(id, {
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  });
}

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

// ---- setup / teardown ----

beforeEach(async () => {
  resetFirestoreMock();
  mockState.students.clear();
  mockState.attendance.clear();
  mockState.attendanceCounter = 1;
  mockVerifyIdToken.mockReset();

  server = Fastify({ logger: false });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    return reply.status(500).send({ success: false, message: msg });
  });

  server.decorateRequest("requestId", "test-request-id");

  server.decorate("cache", {
    get: () => undefined,
    set: () => true,
    setWithTTL: () => true,
    del: () => 0,
    flushNamespace: () => {},
    flushAll: () => {},
    stats: () => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }),
  });

  await server.register(attendanceRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// POST /attendance (single)
// ---------------------------------------------------------------------------

describe("POST /attendance", () => {
  it("marks attendance for a valid student and returns 201", async () => {
    setupAuthUser("Staff");
    seedSchool();
    seedStudent("stu_1");

    const res = await server.inject({
      method: "POST",
      url: "/attendance",
      headers: { authorization: "Bearer token" },
      payload: {
        studentId: "stu_1",
        date: todayIsoDate(),
        status: "Present",
        classId: "10",
        sectionId: "A",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.studentId).toBe("stu_1");
    expect(body.data.status).toBe("Present");
  });

  it("returns 400 for missing fields", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/attendance",
      headers: { authorization: "Bearer token" },
      payload: { studentId: "stu_1" }, // missing date, status, classId, sectionId
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when student does not exist", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/attendance",
      headers: { authorization: "Bearer token" },
      payload: {
        studentId: "nonexistent",
        date: todayIsoDate(),
        status: "Present",
        classId: "10",
        sectionId: "A",
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 403 for cross-tenant student", async () => {
    setupAuthUser("Staff");
    seedSchool();
    seedStudent("stu_other", "school_2");

    const res = await server.inject({
      method: "POST",
      url: "/attendance",
      headers: { authorization: "Bearer token" },
      payload: {
        studentId: "stu_other",
        date: todayIsoDate(),
        status: "Present",
        classId: "10",
        sectionId: "A",
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 409 for duplicate attendance", async () => {
    setupAuthUser("Staff");
    seedSchool();
    seedStudent("stu_1");

    // Seed existing attendance record
    seedDoc("attendance", "att_existing", {
      studentId: "stu_1",
      schoolId: "school_1",
      date: todayIsoDate(),
      status: "Present",
      classId: "10",
      sectionId: "A",
    });
    seedPrismaAttendance("att_existing", {
      studentId: "stu_1",
      schoolId: "school_1",
      date: todayIsoDate(),
      status: "Present",
      classId: "10",
      sectionId: "A",
    });

    const res = await server.inject({
      method: "POST",
      url: "/attendance",
      headers: { authorization: "Bearer token" },
      payload: {
        studentId: "stu_1",
        date: todayIsoDate(),
        status: "Absent",
        classId: "10",
        sectionId: "A",
      },
    });

    expect(res.statusCode).toBe(409);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/attendance",
      payload: {
        studentId: "stu_1",
        date: todayIsoDate(),
        status: "Present",
        classId: "10",
        sectionId: "A",
      },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /attendance?date=YYYY-MM-DD
// ---------------------------------------------------------------------------

describe("GET /attendance", () => {
  it("returns attendance records for a given date", async () => {
    setupAuthUser("Staff");
    seedSchool();

    seedPrismaAttendance("att_1", {
      studentId: "stu_1",
      schoolId: "school_1",
      date: "2025-03-15",
      status: "Present",
      studentName: "Alpha",
    });
    seedPrismaAttendance("att_2", {
      studentId: "stu_2",
      schoolId: "school_1",
      date: "2025-03-15",
      status: "Absent",
      studentName: "Beta",
    });

    const res = await server.inject({
      method: "GET",
      url: "/attendance?date=2025-03-15",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("returns recent attendance records when date query param is missing", async () => {
    setupAuthUser("Staff");
    seedSchool();

    seedPrismaAttendance("att_recent_1", {
      studentId: "stu_1",
      schoolId: "school_1",
      date: "2025-03-15",
      status: "Present",
      studentName: "Recent",
    });

    const res = await server.inject({
      method: "GET",
      url: "/attendance",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
  });

  it("returns 400 for invalid date format", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/attendance?date=15-03-2025",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("does not return records from another school", async () => {
    setupAuthUser("Staff");
    seedSchool();

    seedPrismaAttendance("att_other", {
      studentId: "stu_1",
      schoolId: "school_2",
      date: "2025-03-15",
      status: "Present",
      studentName: "Other",
    });

    const res = await server.inject({
      method: "GET",
      url: "/attendance?date=2025-03-15",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /attendance/bulk
// ---------------------------------------------------------------------------

describe("POST /attendance/bulk", () => {
  it("creates bulk attendance and returns 201", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/attendance/bulk",
      headers: { authorization: "Bearer token" },
      payload: {
        classId: "10",
        sectionId: "A",
        date: todayIsoDate(),
        entries: [
          { studentId: "stu_1", status: "Present" },
          { studentId: "stu_2", status: "Absent" },
          { studentId: "stu_3", status: "Late", remarks: "10 min late" },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(3);
    expect(body.data.total).toBe(3);
  });

  it("skips duplicate entries in bulk", async () => {
    setupAuthUser("Staff");
    seedSchool();

    // Seed existing attendance for stu_1 on this date
    seedDoc("attendance", "att_existing", {
      studentId: "stu_1",
      schoolId: "school_1",
      date: todayIsoDate(),
      status: "Present",
    });
    seedPrismaAttendance("att_existing", {
      studentId: "stu_1",
      schoolId: "school_1",
      date: todayIsoDate(),
      status: "Present",
      classId: "10",
      sectionId: "A",
    });

    const res = await server.inject({
      method: "POST",
      url: "/attendance/bulk",
      headers: { authorization: "Bearer token" },
      payload: {
        classId: "10",
        sectionId: "A",
        date: todayIsoDate(),
        entries: [
          { studentId: "stu_1", status: "Absent" }, // duplicate
          { studentId: "stu_2", status: "Present" },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.created).toBe(1);
    expect(body.data.errors.length).toBe(1);
    expect(body.data.errors[0].studentId).toBe("stu_1");
  });

  it("returns 400 for invalid bulk payload", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/attendance/bulk",
      headers: { authorization: "Bearer token" },
      payload: { classId: "10" }, // missing sectionId, date, entries
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when entries array is empty", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/attendance/bulk",
      headers: { authorization: "Bearer token" },
      payload: {
        classId: "10",
        sectionId: "A",
        date: todayIsoDate(),
        entries: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /attendance/stats
// ---------------------------------------------------------------------------

describe("GET /attendance/stats", () => {
  it("returns attendance statistics", async () => {
    setupAuthUser("Staff");
    seedSchool();

    seedDoc("attendance", "att_1", {
      schoolId: "school_1",
      studentId: "stu_1",
      date: "2025-03-15",
      status: "Present",
    });
    seedPrismaAttendance("att_1", {
      schoolId: "school_1",
      studentId: "stu_1",
      date: "2025-03-15",
      status: "Present",
      classId: "10",
      sectionId: "A",
    });
    seedDoc("attendance", "att_2", {
      schoolId: "school_1",
      studentId: "stu_2",
      date: "2025-03-15",
      status: "Absent",
    });
    seedPrismaAttendance("att_2", {
      schoolId: "school_1",
      studentId: "stu_2",
      date: "2025-03-15",
      status: "Absent",
      classId: "10",
      sectionId: "A",
    });
    seedDoc("attendance", "att_3", {
      schoolId: "school_1",
      studentId: "stu_3",
      date: "2025-03-15",
      status: "Late",
    });
    seedPrismaAttendance("att_3", {
      schoolId: "school_1",
      studentId: "stu_3",
      date: "2025-03-15",
      status: "Late",
      classId: "10",
      sectionId: "A",
    });

    const res = await server.inject({
      method: "GET",
      url: "/attendance/stats",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(3);
    expect(body.data.present).toBe(1);
    expect(body.data.absent).toBe(1);
    expect(body.data.late).toBe(1);
    expect(body.data).toHaveProperty("attendanceRate");
  });

  it("returns zero stats when no records", async () => {
    setupAuthUser("Staff");
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/attendance/stats",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.total).toBe(0);
    expect(body.data.attendanceRate).toBe(0);
  });

  it("filters stats by classId", async () => {
    setupAuthUser("Staff");
    seedSchool();

    seedDoc("attendance", "att_10", {
      schoolId: "school_1",
      classId: "10",
      date: "2025-03-15",
      status: "Present",
    });
    seedPrismaAttendance("att_10", {
      schoolId: "school_1",
      classId: "10",
      date: "2025-03-15",
      status: "Present",
      studentId: "stu_10",
      sectionId: "A",
    });
    seedDoc("attendance", "att_9", {
      schoolId: "school_1",
      classId: "9",
      date: "2025-03-15",
      status: "Present",
    });
    seedPrismaAttendance("att_9", {
      schoolId: "school_1",
      classId: "9",
      date: "2025-03-15",
      status: "Present",
      studentId: "stu_9",
      sectionId: "A",
    });

    const res = await server.inject({
      method: "GET",
      url: "/attendance/stats?classId=10",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.total).toBe(1);
  });

  it("does not include records from other schools", async () => {
    setupAuthUser("Staff");
    seedSchool();

    seedDoc("attendance", "att_mine", {
      schoolId: "school_1",
      date: "2025-03-15",
      status: "Present",
    });
    seedPrismaAttendance("att_mine", {
      schoolId: "school_1",
      date: "2025-03-15",
      status: "Present",
      studentId: "stu_mine",
      classId: "10",
      sectionId: "A",
    });
    seedDoc("attendance", "att_other", {
      schoolId: "school_2",
      date: "2025-03-15",
      status: "Present",
    });
    seedPrismaAttendance("att_other", {
      schoolId: "school_2",
      date: "2025-03-15",
      status: "Present",
      studentId: "stu_other",
      classId: "10",
      sectionId: "A",
    });

    const res = await server.inject({
      method: "GET",
      url: "/attendance/stats",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.total).toBe(1);
  });
});

