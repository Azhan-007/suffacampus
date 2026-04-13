/**
 * Modern end-to-end smoke tests.
 *
 * This suite validates high-value auth and core domain flows against current
 * API contracts while using deterministic in-memory Prisma mocks.
 */

import request from "supertest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../../src/server";
import {
  auth,
  getAllDocs,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";

type TestUser = {
  id: string;
  uid: string;
  email: string;
  username?: string;
  displayName: string;
  role: string;
  schoolId: string;
  isActive: boolean;
  studentId?: string;
  teacherId?: string;
  studentIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

type TestStudent = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  classId?: string;
  sectionId?: string;
  rollNumber?: string;
  photoURL?: string | null;
  isDeleted: boolean;
};

type TestAttendance = {
  id: string;
  schoolId: string;
  studentId: string;
  studentName?: string;
  classId: string;
  sectionId: string;
  date: string;
  status: string;
  remarks?: string | null;
  markedBy?: string;
  createdAt: Date;
  updatedAt: Date;
};

type TestResult = {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  classId: string;
  sectionId: string;
  className?: string;
  examType: string;
  examName: string;
  subject: string;
  marksObtained: number;
  totalMarks: number;
  percentage?: number;
  grade?: string;
  status?: string;
  rank?: number;
  remarks?: string | null;
  teacherId?: string;
  published?: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TestParentInvite = {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  code: string;
  createdBy: string;
  expiresAt: Date;
  isActive: boolean;
  usedBy?: string;
  usedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
};

type TestFee = {
  id: string;
  schoolId: string;
  studentId: string;
  amount: number;
  status: string;
  createdAt: Date;
};

type TestEvent = {
  id: string;
  schoolId: string;
  title: string;
  eventDate: string;
  isActive: boolean;
  createdAt: Date;
};

const mockState = {
  users: new Map<string, TestUser>(),
  schools: new Map<string, Record<string, unknown>>(),
  subscriptions: new Map<string, Record<string, unknown>>(),
  sessions: new Map<string, Record<string, unknown>>(),
  revokedTokens: new Map<string, Record<string, unknown>>(),
  teachers: new Map<string, Record<string, unknown>>(),
  teacherAssignments: new Map<string, Record<string, unknown>>(),
  students: new Map<string, TestStudent>(),
  attendance: new Map<string, TestAttendance>(),
  results: new Map<string, TestResult>(),
  parentInvites: new Map<string, TestParentInvite>(),
  fees: new Map<string, TestFee>(),
  events: new Map<string, TestEvent>(),
  counters: {
    attendance: 1,
    result: 1,
    invite: 1,
    fee: 1,
    event: 1,
    session: 1,
  },
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where: { uid } }) => mockState.users.get(uid) ?? null),
      findFirst: jest.fn(async ({ where }) => {
        const username = where?.username;
        const email =
          typeof where?.email === "string"
            ? where.email.trim().toLowerCase()
            : undefined;
        const uid = where?.uid;
        const schoolId = where?.schoolId;
        const isActive = where?.isActive;
        return (
          [...mockState.users.values()].find(
            (u) =>
              (typeof uid === "undefined" || u.uid === uid) &&
              (typeof schoolId === "undefined" || u.schoolId === schoolId) &&
              (typeof username === "undefined" || u.username === username) &&
              (typeof email === "undefined" || u.email.toLowerCase() === email) &&
              (typeof isActive === "undefined" || u.isActive === isActive)
          ) ?? null
        );
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const [uid, row] of mockState.users.entries()) {
          if (where?.uid && uid !== where.uid) continue;
          mockState.users.set(uid, { ...row, ...data, updatedAt: new Date() });
          count += 1;
        }
        return { count };
      }),
      update: jest.fn(async ({ where: { uid }, data }) => {
        const existing = mockState.users.get(uid);
        if (!existing) throw new Error("User not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.users.set(uid, updated);
        return updated;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        let count = 0;
        for (const [uid, row] of mockState.users.entries()) {
          if (where?.uid && uid !== where.uid) continue;
          if (where?.schoolId && row.schoolId !== where.schoolId) continue;
          mockState.users.delete(uid);
          count += 1;
        }
        return { count };
      }),
    },
    school: {
      findUnique: jest.fn(async ({ where, select }) => {
        let row: Record<string, unknown> | null = null;

        if (where?.id) {
          row = mockState.schools.get(where.id) ?? null;
          if (!row) {
            row = (getAllDocs("schools").get(where.id) as Record<string, unknown> | undefined) ?? null;
          }
        } else if (where?.code) {
          row =
            [...mockState.schools.values()].find(
              (s) => typeof s.code === "string" && s.code === where.code
            ) ?? null;

          if (!row) {
            row =
              [...(getAllDocs("schools")?.values?.() ?? [])].find(
                (s: Record<string, unknown>) => s.code === where.code
              ) ?? null;
          }
        }

        if (!row) return null;
        if (!select) return row;

        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = row[key];
        }
        return selected;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        let count = 0;
        for (const [id, row] of mockState.schools.entries()) {
          if (where?.id && id !== where.id) continue;
          if (where?.code && row.code !== where.code) continue;
          mockState.schools.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
    subscription: {
      deleteMany: jest.fn(async ({ where }) => {
        let count = 0;
        for (const [id, row] of mockState.subscriptions.entries()) {
          if (where?.schoolId && row.schoolId !== where.schoolId) continue;
          mockState.subscriptions.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
    student: {
      findUnique: jest.fn(async ({ where: { id }, select }) => {
        const row = mockState.students.get(id) ?? null;
        if (!row) return null;
        if (!select) return row;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = (row as any)[key];
        }
        return selected;
      }),
      findMany: jest.fn(async ({ where }) => {
        const ids = where?.id?.in ?? [];
        return [...mockState.students.values()].filter(
          (s) => ids.includes(s.id) && (!where?.schoolId || s.schoolId === where.schoolId)
        );
      }),
    },
    attendance: {
      findUnique: jest.fn(async ({ where }) => {
        if (where?.id) return mockState.attendance.get(where.id) ?? null;
        if (where?.schoolId_studentId_date) {
          const key = where.schoolId_studentId_date;
          return (
            [...mockState.attendance.values()].find(
              (a) => a.schoolId === key.schoolId && a.studentId === key.studentId && a.date === key.date
            ) ?? null
          );
        }
        return null;
      }),
      create: jest.fn(async ({ data }) => {
        const id = `att_${mockState.counters.attendance++}`;
        const row: TestAttendance = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.attendance.set(id, row);
        return row;
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.attendance.get(id);
        if (!existing) throw new Error("Attendance not found");
        const updated: TestAttendance = { ...existing, ...data, updatedAt: new Date() };
        mockState.attendance.set(id, updated);
        return updated;
      }),
      delete: jest.fn(async ({ where: { id } }) => {
        const existing = mockState.attendance.get(id);
        if (!existing) throw new Error("Attendance not found");
        mockState.attendance.delete(id);
        return existing;
      }),
      findMany: jest.fn(async ({ where, orderBy }) => {
        let rows = [...mockState.attendance.values()].filter((a) => {
          if (where?.schoolId && a.schoolId !== where.schoolId) return false;
          if (where?.date && a.date !== where.date) return false;
          if (where?.studentId && a.studentId !== where.studentId) return false;
          if (where?.classId && a.classId !== where.classId) return false;
          if (where?.sectionId && a.sectionId !== where.sectionId) return false;
          if (where?.status?.in && Array.isArray(where.status.in) && !where.status.in.includes(a.status)) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "studentName";
        const sortOrder = (orderBy?.[sortBy] ?? "asc") as "asc" | "desc";
        rows = rows.sort((x, y) => {
          const lhs = (x as any)[sortBy];
          const rhs = (y as any)[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        return rows;
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
    result: {
      create: jest.fn(async ({ data }) => {
        const id = `res_${mockState.counters.result++}`;
        const row: TestResult = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.results.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.results.values()].filter((r) => {
          if (where?.schoolId && r.schoolId !== where.schoolId) return false;
          if (where?.studentId && r.studentId !== where.studentId) return false;
          if (where?.classId && r.classId !== where.classId) return false;
          if (where?.sectionId && r.sectionId !== where.sectionId) return false;
          if (where?.examType && r.examType !== where.examType) return false;
          if (where?.subject && r.subject !== where.subject) return false;
          if (typeof where?.isActive !== "undefined" && r.isActive !== where.isActive) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = (a as any)[sortBy];
          const rhs = (b as any)[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
      findUnique: jest.fn(async ({ where: { id } }) => mockState.results.get(id) ?? null),
      findFirst: jest.fn(async ({ where }) => {
        return (
          [...mockState.results.values()].find(
            (r) =>
              (!where?.schoolId || r.schoolId === where.schoolId) &&
              (!where?.studentId || r.studentId === where.studentId) &&
              (typeof where?.isActive === "undefined" || r.isActive === where.isActive)
          ) ?? null
        );
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.results.get(id);
        if (!existing) throw new Error("Result not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.results.set(id, updated);
        return updated;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const [id, row] of mockState.results.entries()) {
          if (where?.schoolId && row.schoolId !== where.schoolId) continue;
          if (where?.teacherId && row.teacherId !== where.teacherId) continue;
          if (typeof where?.published !== "undefined" && row.published !== where.published) continue;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) continue;
          if (Array.isArray(where?.OR) && where.OR.length > 0) {
            const inScope = where.OR.some(
              (scope: { classId?: string; sectionId?: string }) =>
                row.classId === scope.classId && row.sectionId === scope.sectionId
            );
            if (!inScope) continue;
          }
          mockState.results.set(id, { ...row, ...data, updatedAt: new Date() });
          count += 1;
        }
        return { count };
      }),
    },
    teacher: {
      findUnique: jest.fn(async ({ where: { id }, select }) => {
        const row = mockState.teachers.get(id) ?? null;
        if (!row) return null;
        if (!select) return row;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = row[key];
        }
        return selected;
      }),
    },
    teacherClassAssignment: {
      findMany: jest.fn(async ({ where, select }) => {
        const rows = [...mockState.teacherAssignments.values()].filter((row) => {
          if (where?.teacherId && row.teacherId !== where.teacherId) return false;
          if (where?.teacher?.schoolId && row.schoolId !== where.teacher.schoolId) return false;
          return true;
        });

        if (!select) return rows;
        return rows.map((row) => ({
          classId: row.classId,
          sectionId: row.sectionId,
        }));
      }),
    },
    parentInvite: {
      create: jest.fn(async ({ data }) => {
        const id = `inv_${mockState.counters.invite++}`;
        const row: TestParentInvite = {
          id,
          createdAt: new Date(),
          ...data,
        };
        mockState.parentInvites.set(id, row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }) => {
        return (
          [...mockState.parentInvites.values()].find(
            (i) => i.code === where.code && i.isActive === where.isActive
          ) ?? null
        );
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.parentInvites.get(id);
        if (!existing) throw new Error("Invite not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.parentInvites.set(id, updated);
        return updated;
      }),
    },
    fee: {
      aggregate: jest.fn(async ({ where }) => {
        const amount = [...mockState.fees.values()]
          .filter((f) => {
            if (where?.schoolId && f.schoolId !== where.schoolId) return false;
            if (where?.studentId && f.studentId !== where.studentId) return false;
            if (where?.status?.in && Array.isArray(where.status.in) && !where.status.in.includes(f.status)) return false;
            return true;
          })
          .reduce((sum, f) => sum + f.amount, 0);
        return { _sum: { amount } };
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.fees.values()].filter((f) => {
          if (where?.schoolId && f.schoolId !== where.schoolId) return false;
          if (where?.studentId && f.studentId !== where.studentId) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy as keyof TestFee];
          const rhs = b[sortBy as keyof TestFee];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
    },
    event: {
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.events.values()].filter((e) => {
          if (where?.schoolId && e.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && e.isActive !== where.isActive) return false;
          if (where?.eventDate?.gte && e.eventDate < where.eventDate.gte) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "eventDate";
        const sortOrder = (orderBy?.[sortBy] ?? "asc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy as keyof TestEvent];
          const rhs = b[sortBy as keyof TestEvent];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
    },
    session: {
      count: jest.fn(async ({ where }) =>
        [...mockState.sessions.values()].filter((session) => {
          if (where?.userUid && session.userUid !== where.userUid) return false;
          if (where?.schoolId && session.schoolId !== where.schoolId) return false;
          if (typeof where?.revokedAt !== "undefined" && session.revokedAt !== where.revokedAt) return false;
          if (where?.expiresAt?.gt && new Date(session.expiresAt as string) <= where.expiresAt.gt) return false;
          return true;
        }).length
      ),
      findMany: jest.fn(async ({ where, orderBy, take, select }) => {
        let rows = [...mockState.sessions.values()].filter((session) => {
          if (where?.id?.in && Array.isArray(where.id.in) && !where.id.in.includes(session.id)) return false;
          if (where?.userUid && session.userUid !== where.userUid) return false;
          if (where?.schoolId && session.schoolId !== where.schoolId) return false;
          if (typeof where?.revokedAt !== "undefined" && session.revokedAt !== where.revokedAt) return false;
          if (where?.expiresAt?.gt && new Date(session.expiresAt as string) <= where.expiresAt.gt) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "lastActiveAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy as keyof typeof a] as any;
          const rhs = b[sortBy as keyof typeof b] as any;
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);

        if (!select) return rows;
        return rows.map((row) => {
          const selected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) selected[key] = row[key as keyof typeof row];
          }
          return selected;
        });
      }),
      findFirst: jest.fn(async ({ where }) => {
        return (
          [...mockState.sessions.values()].find((session) => {
            if (where?.id && session.id !== where.id) return false;
            if (where?.userUid && session.userUid !== where.userUid) return false;
            if (where?.schoolId && session.schoolId !== where.schoolId) return false;
            if (typeof where?.revokedAt !== "undefined" && session.revokedAt !== where.revokedAt) return false;
            if (where?.expiresAt?.gt && new Date(session.expiresAt as string) <= where.expiresAt.gt) return false;
            return true;
          }) ?? null
        );
      }),
      create: jest.fn(async ({ data }) => {
        const id = `sess_${mockState.counters.session++}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.sessions.set(id, row);
        return row;
      }),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.sessions.get(id);
        if (!existing) throw new Error("Session not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.sessions.set(id, updated);
        return updated;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const [id, row] of mockState.sessions.entries()) {
          if (where?.id?.in && Array.isArray(where.id.in) && !where.id.in.includes(id)) continue;
          if (where?.userUid && row.userUid !== where.userUid) continue;
          if (where?.schoolId && row.schoolId !== where.schoolId) continue;
          mockState.sessions.set(id, { ...row, ...data, updatedAt: new Date() });
          count += 1;
        }
        return { count };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        let count = 0;
        for (const [id, row] of mockState.sessions.entries()) {
          if (where?.expiresAt?.lt && new Date(row.expiresAt as string) >= where.expiresAt.lt) continue;
          mockState.sessions.delete(id);
          count += 1;
        }
        return { count };
      }),
    },
    revokedToken: {
      findUnique: jest.fn(async ({ where: { jti } }) => mockState.revokedTokens.get(jti) ?? null),
      createMany: jest.fn(async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const row of data as Array<Record<string, unknown>>) {
          const jti = String(row.jti);
          if (skipDuplicates && mockState.revokedTokens.has(jti)) {
            continue;
          }
          mockState.revokedTokens.set(jti, row);
          count += 1;
        }
        return { count };
      }),
      upsert: jest.fn(async ({ where: { jti }, create, update }) => {
        const existing = mockState.revokedTokens.get(jti);
        const row = existing ? { ...existing, ...update } : create;
        mockState.revokedTokens.set(jti, row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        let count = 0;
        for (const [jti, row] of mockState.revokedTokens.entries()) {
          if (where?.expiresAt?.lt && new Date(String(row.expiresAt)) >= where.expiresAt.lt) continue;
          mockState.revokedTokens.delete(jti);
          count += 1;
        }
        return { count };
      }),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        const tx = {
          school: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const id =
                (data.id as string | undefined) ??
                `school_${mockState.schools.size + 1}`;
              const row = { id, ...data };
              mockState.schools.set(id, row);
              seedDoc("schools", id, row);
              return row;
            },
          },
          user: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const uid =
                (data.uid as string | undefined) ??
                `user_${mockState.users.size + 1}`;
              const row: TestUser = {
                id: (data.id as string | undefined) ?? `usr_${uid}`,
                uid,
                email: (data.email as string | undefined) ?? `${uid}@school.test`,
                username: data.username as string | undefined,
                displayName:
                  (data.displayName as string | undefined) ?? uid,
                role: (data.role as string | undefined) ?? "Admin",
                schoolId: (data.schoolId as string | undefined) ?? "school_1",
                isActive: (data.isActive as boolean | undefined) ?? true,
                studentIds: Array.isArray(data.studentIds)
                  ? (data.studentIds as string[])
                  : [],
                createdAt: new Date(),
                updatedAt: new Date(),
              };

              mockState.users.set(uid, row);
              seedDoc("users", uid, {
                uid,
                email: row.email,
                displayName: row.displayName,
                role: row.role,
                schoolId: row.schoolId,
                isActive: row.isActive,
                studentIds: row.studentIds,
              });

              return row;
            },
          },
          subscription: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
              const id =
                (data.id as string | undefined) ??
                `sub_${mockState.subscriptions.size + 1}`;
              const row = { id, ...data };
              mockState.subscriptions.set(id, row);
              return row;
            },
          },
          schoolConfig: {
            create: async ({ data }: { data: Record<string, unknown> }) => ({
              id: `cfg_${Date.now()}`,
              ...data,
            }),
          },
          session: {
            deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
              let count = 0;
              for (const [id, row] of mockState.sessions.entries()) {
                if (where?.expiresAt && (where.expiresAt as any).lt) {
                  if (new Date(String(row.expiresAt)) >= (where.expiresAt as any).lt) continue;
                }
                mockState.sessions.delete(id);
                count += 1;
              }
              return { count };
            },
            updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
              let count = 0;
              for (const [id, row] of mockState.sessions.entries()) {
                if ((where.id as any)?.in && !(where.id as any).in.includes(id)) continue;
                mockState.sessions.set(id, { ...row, ...data, updatedAt: new Date() });
                count += 1;
              }
              return { count };
            },
          },
          revokedToken: {
            deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
              let count = 0;
              for (const [jti, row] of mockState.revokedTokens.entries()) {
                if (where?.expiresAt && (where.expiresAt as any).lt) {
                  if (new Date(String(row.expiresAt)) >= (where.expiresAt as any).lt) continue;
                }
                mockState.revokedTokens.delete(jti);
                count += 1;
              }
              return { count };
            },
            createMany: async ({ data, skipDuplicates }: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) => {
              let count = 0;
              for (const row of data) {
                const jti = String(row.jti);
                if (skipDuplicates && mockState.revokedTokens.has(jti)) continue;
                mockState.revokedTokens.set(jti, row);
                count += 1;
              }
              return { count };
            },
          },
        };

        return (arg as (input: typeof tx) => Promise<unknown>)(tx);
      }

      if (Array.isArray(arg)) {
        return Promise.all(arg as Array<Promise<unknown>>);
      }

      return arg;
    }),
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

describe("E2E: Auth Smoke Flows", () => {
  let app: FastifyInstance;
  const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;
  const mockGetUserByEmail = auth.getUserByEmail as jest.Mock;
  const mockCreateUser = auth.createUser as jest.Mock;
  const mockSetCustomUserClaims = auth.setCustomUserClaims as jest.Mock;

  function seedAuthUser(uid: string, role: string, schoolId: string, extra: Record<string, unknown> = {}) {
    seedDoc("users", uid, {
      uid,
      email: `${uid}@school.test`,
      displayName: uid,
      role,
      schoolId,
      status: "active",
      ...extra,
    });
    mockState.users.set(uid, {
      id: `usr_${uid}`,
      uid,
      email: (extra.email as string) ?? `${uid}@school.test`,
      username: typeof extra.username === "string" ? extra.username : undefined,
      displayName: (extra.displayName as string) ?? uid,
      role,
      schoolId,
      isActive: true,
      studentId: typeof extra.studentId === "string" ? extra.studentId : undefined,
      teacherId: typeof extra.teacherId === "string" ? extra.teacherId : undefined,
      studentIds: (extra.studentIds as string[]) ?? [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  beforeAll(async () => {
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetFirestoreMock();
    mockState.users.clear();
    mockState.schools.clear();
    mockState.subscriptions.clear();
    mockState.sessions.clear();
    mockState.revokedTokens.clear();
    mockState.teachers.clear();
    mockState.teacherAssignments.clear();
    mockState.students.clear();
    mockState.attendance.clear();
    mockState.results.clear();
    mockState.parentInvites.clear();
    mockState.fees.clear();
    mockState.events.clear();
    mockState.counters.attendance = 1;
    mockState.counters.result = 1;
    mockState.counters.invite = 1;
    mockState.counters.fee = 1;
    mockState.counters.event = 1;
    mockState.counters.session = 1;

    mockVerifyIdToken.mockReset();
    mockGetUserByEmail.mockReset();
    mockCreateUser.mockReset();
    mockSetCustomUserClaims.mockReset();

    mockSetCustomUserClaims.mockResolvedValue(undefined);
  });

  it("returns liveness health", async () => {
    const res = await request(app.server)
      .get("/health")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("alive");
  });

  it("resolves user by username", async () => {
    seedAuthUser("u1", "Student", "school_1", {
      username: "alice",
      email: "alice@school.test",
      displayName: "Alice",
      studentId: "stu_1",
    });

    const res = await request(app.server)
      .get("/api/v1/auth/user-by-username")
      .query({ username: "alice" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe("alice@school.test");
    expect(res.body.data.role).toBe("Student");
  });

  it("returns school details by code", async () => {
    seedDoc("schools", "school_1", {
      id: "school_1",
      name: "Alpha School",
      code: "ALPHA123",
      primaryColor: "#1a73e8",
      isActive: true,
    });

    const res = await request(app.server)
      .get("/api/v1/auth/schools")
      .query({ code: "ALPHA123" })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe("school_1");
    expect(res.body.data.name).toBe("Alpha School");
  });

  it("authenticates and returns current profile", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "u_admin", email: "admin@alpha.test" });
    seedAuthUser("u_admin", "Admin", "school_1", { email: "admin@alpha.test", displayName: "Admin Alpha" });

    const res = await request(app.server)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer token")
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.uid).toBe("u_admin");
    expect(res.body.data.role).toBe("Admin");
    expect(res.body.data.schoolId).toBe("school_1");
  });

  it("records login and returns user envelope", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "u_admin", email: "admin@alpha.test" });
    seedAuthUser("u_admin", "Admin", "school_1", { email: "admin@alpha.test", displayName: "Admin Alpha" });

    const res = await request(app.server)
      .post("/api/v1/auth/login")
      .set("Authorization", "Bearer token")
      .send({})
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.uid).toBe("u_admin");
    expect(res.body.data.role).toBe("Admin");
    expect(typeof res.body.data.lastLogin).toBe("string");
  });

  it("registers a new school and admin", async () => {
    mockGetUserByEmail.mockRejectedValueOnce({ code: "auth/user-not-found" });
    mockCreateUser.mockResolvedValueOnce({ uid: "new_admin_uid" });

    const res = await request(app.server)
      .post("/api/v1/auth/register")
      .send({
        schoolName: "Beta Academy",
        adminName: "Beta Admin",
        email: "beta.admin@test.com",
        password: "ValidPass1",
        city: "Mumbai",
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe("Admin");
    expect(res.body.data.schoolId).toBeDefined();
    expect(res.body.data.uid).toBe("new_admin_uid");
  });

  it("marks and reads attendance for a student", async () => {
    seedAuthUser("teacher_1", "Teacher", "school_1");
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });

    mockState.students.set("stu_1", {
      id: "stu_1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      isDeleted: false,
    });

    const date = new Date().toISOString().split("T")[0];
    const mark = await request(app.server)
      .post("/api/v1/attendance")
      .set("Authorization", "Bearer token")
      .send({
        studentId: "stu_1",
        date,
        status: "Present",
        classId: "10",
        sectionId: "A",
      })
      .expect(201);

    expect(mark.body.success).toBe(true);
    expect(mark.body.data.studentId).toBe("stu_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const list = await request(app.server)
      .get("/api/v1/attendance")
      .query({ date })
      .set("Authorization", "Bearer token")
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBe(1);
    expect(list.body.data[0].studentId).toBe("stu_1");
  });

  it("creates and lists student exam results", async () => {
    seedAuthUser("teacher_1", "Teacher", "school_1");
    seedAuthUser("admin_1", "Admin", "school_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const create = await request(app.server)
      .post("/api/v1/results")
      .set("Authorization", "Bearer token")
      .send({
        studentId: "stu_1",
        studentName: "John Doe",
        rollNumber: "001",
        classId: "10",
        sectionId: "A",
        examType: "Final",
        examName: "Final Exam 2026",
        subject: "Mathematics",
        marksObtained: 86,
        totalMarks: 100,
      })
      .expect(201);

    expect(create.body.success).toBe(true);
    expect(create.body.data.studentId).toBe("stu_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    const list = await request(app.server)
      .get("/api/v1/results")
      .query({ studentId: "stu_1" })
      .set("Authorization", "Bearer token")
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
    expect(list.body.data[0].studentId).toBe("stu_1");
  });

  it("creates and redeems a parent invite", async () => {
    seedAuthUser("admin_1", "Admin", "school_1");
    seedAuthUser("parent_1", "Parent", "school_1", { studentIds: [] });

    mockState.students.set("stu_1", {
      id: "stu_1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      isDeleted: false,
    });

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    const invite = await request(app.server)
      .post("/api/v1/parent/invites")
      .set("Authorization", "Bearer token")
      .send({ studentId: "stu_1" })
      .expect(201);

    expect(invite.body.success).toBe(true);
    expect(invite.body.data.code).toBeDefined();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    const redeem = await request(app.server)
      .post("/api/v1/parent/link")
      .set("Authorization", "Bearer token")
      .send({ code: invite.body.data.code })
      .expect(200);

    expect(redeem.body.success).toBe(true);
    expect(redeem.body.data.studentId).toBe("stu_1");

    const parent = mockState.users.get("parent_1");
    expect(parent?.role).toBe("Parent");
    expect(Array.isArray(parent?.studentIds)).toBe(true);
    expect(parent?.studentIds).toContain("stu_1");
  });

  it("updates and deletes attendance through lifecycle endpoints", async () => {
    seedAuthUser("teacher_1", "Teacher", "school_1");
    seedAuthUser("admin_1", "Admin", "school_1");
    mockState.students.set("stu_1", {
      id: "stu_1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      isDeleted: false,
    });

    const date = new Date().toISOString().split("T")[0];

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const created = await request(app.server)
      .post("/api/v1/attendance")
      .set("Authorization", "Bearer token")
      .send({
        studentId: "stu_1",
        studentName: "John Doe",
        date,
        status: "Present",
        classId: "10",
        sectionId: "A",
      })
      .expect(201);

    const attendanceId = created.body.data.id;
    expect(attendanceId).toBeDefined();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const updated = await request(app.server)
      .patch(`/api/v1/attendance/${attendanceId}`)
      .set("Authorization", "Bearer token")
      .send({ status: "Late", remarks: "Traffic delay" })
      .expect(200);

    expect(updated.body.success).toBe(true);
    expect(updated.body.data.status).toBe("Late");
    expect(updated.body.data.remarks).toBe("Traffic delay");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    await request(app.server)
      .delete(`/api/v1/attendance/${attendanceId}`)
      .set("Authorization", "Bearer token")
      .expect(200);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const list = await request(app.server)
      .get("/api/v1/attendance")
      .query({ date })
      .set("Authorization", "Bearer token")
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data).toHaveLength(0);
  });

  it("publishes and soft-deletes a result via lifecycle endpoints", async () => {
    seedAuthUser("teacher_1", "Teacher", "school_1");
    seedAuthUser("admin_1", "Admin", "school_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const created = await request(app.server)
      .post("/api/v1/results")
      .set("Authorization", "Bearer token")
      .send({
        studentId: "stu_1",
        studentName: "John Doe",
        rollNumber: "001",
        classId: "10",
        sectionId: "A",
        examType: "Midterm",
        examName: "Midterm 2026",
        subject: "Science",
        marksObtained: 72,
        totalMarks: 100,
      })
      .expect(201);

    const resultId = created.body.data.id;
    expect(resultId).toBeDefined();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const published = await request(app.server)
      .patch(`/api/v1/results/${resultId}/publish`)
      .set("Authorization", "Bearer token")
      .send({ published: true })
      .expect(200);

    expect(published.body.success).toBe(true);
    expect(published.body.data.published).toBe(true);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    await request(app.server)
      .delete(`/api/v1/results/${resultId}`)
      .set("Authorization", "Bearer token")
      .expect(200);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    const list = await request(app.server)
      .get("/api/v1/results")
      .query({ studentId: "stu_1" })
      .set("Authorization", "Bearer token")
      .expect(200);

    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data).toHaveLength(0);
  });

  it("allows linked parent to fetch child portal data", async () => {
    seedAuthUser("admin_1", "Admin", "school_1");
    seedAuthUser("parent_1", "Parent", "school_1", { studentIds: [] });

    const today = new Date().toISOString().split("T")[0];
    mockState.students.set("stu_1", {
      id: "stu_1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      classId: "10",
      sectionId: "A",
      rollNumber: "001",
      photoURL: null,
      isDeleted: false,
    });

    mockState.attendance.set("att_seed_1", {
      id: "att_seed_1",
      schoolId: "school_1",
      studentId: "stu_1",
      studentName: "John Doe",
      classId: "10",
      sectionId: "A",
      date: today,
      status: "Present",
      remarks: null,
      markedBy: "teacher_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.results.set("res_seed_1", {
      id: "res_seed_1",
      schoolId: "school_1",
      studentId: "stu_1",
      studentName: "John Doe",
      rollNumber: "001",
      classId: "10",
      sectionId: "A",
      examType: "Final",
      examName: "Final 2026",
      subject: "Math",
      marksObtained: 91,
      totalMarks: 100,
      percentage: 91,
      grade: "A+",
      status: "Pass",
      published: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockState.fees.set("fee_1", {
      id: "fee_1",
      schoolId: "school_1",
      studentId: "stu_1",
      amount: 5000,
      status: "Pending",
      createdAt: new Date(),
    });

    mockState.events.set("evt_1", {
      id: "evt_1",
      schoolId: "school_1",
      title: "Science Fair",
      eventDate: today,
      isActive: true,
      createdAt: new Date(),
    });

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    const invite = await request(app.server)
      .post("/api/v1/parent/invites")
      .set("Authorization", "Bearer token")
      .send({ studentId: "stu_1" })
      .expect(201);

    const code = invite.body.data.code as string;
    expect(code).toBeDefined();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    await request(app.server)
      .post("/api/v1/parent/link")
      .set("Authorization", "Bearer token")
      .send({ code })
      .expect(200);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    const children = await request(app.server)
      .get("/api/v1/parent/children")
      .set("Authorization", "Bearer token")
      .expect(200);
    expect(children.body.success).toBe(true);
    expect(children.body.data).toHaveLength(1);
    expect(children.body.data[0].studentId).toBe("stu_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    const attendance = await request(app.server)
      .get("/api/v1/parent/children/stu_1/attendance")
      .set("Authorization", "Bearer token")
      .expect(200);
    expect(attendance.body.success).toBe(true);
    expect(Array.isArray(attendance.body.data)).toBe(true);
    expect(attendance.body.data[0].studentId).toBe("stu_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    const fees = await request(app.server)
      .get("/api/v1/parent/children/stu_1/fees")
      .set("Authorization", "Bearer token")
      .expect(200);
    expect(fees.body.success).toBe(true);
    expect(Array.isArray(fees.body.data)).toBe(true);
    expect(fees.body.data[0].amount).toBe(5000);

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    const results = await request(app.server)
      .get("/api/v1/parent/children/stu_1/results")
      .set("Authorization", "Bearer token")
      .expect(200);
    expect(results.body.success).toBe(true);
    expect(Array.isArray(results.body.data)).toBe(true);
    expect(results.body.data[0].studentId).toBe("stu_1");

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    const events = await request(app.server)
      .get("/api/v1/parent/events")
      .set("Authorization", "Bearer token")
      .expect(200);
    expect(events.body.success).toBe(true);
    expect(Array.isArray(events.body.data)).toBe(true);
    expect(events.body.data[0].title).toBe("Science Fair");
  });

  it("blocks parent access to an unlinked child", async () => {
    seedAuthUser("parent_1", "Parent", "school_1", { studentIds: ["stu_1"] });

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "parent_1", email: "parent_1@school.test" });
    await request(app.server)
      .get("/api/v1/parent/children/stu_2/results")
      .set("Authorization", "Bearer token")
      .expect(403);
  });

  it("blocks teacher from deleting attendance records", async () => {
    seedAuthUser("teacher_1", "Teacher", "school_1");
    mockState.students.set("stu_1", {
      id: "stu_1",
      schoolId: "school_1",
      firstName: "John",
      lastName: "Doe",
      isDeleted: false,
    });

    const date = new Date().toISOString().split("T")[0];
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    const created = await request(app.server)
      .post("/api/v1/attendance")
      .set("Authorization", "Bearer token")
      .send({
        studentId: "stu_1",
        studentName: "John Doe",
        date,
        status: "Present",
        classId: "10",
        sectionId: "A",
      })
      .expect(201);

    const attendanceId = created.body.data.id;
    expect(attendanceId).toBeDefined();

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "teacher_1", email: "teacher_1@school.test" });
    await request(app.server)
      .delete(`/api/v1/attendance/${attendanceId}`)
      .set("Authorization", "Bearer token")
      .expect(403);
  });

  it("bulk publishes draft results for a teacher", async () => {
    seedAuthUser("admin_1", "Admin", "school_1");
    mockState.teachers.set("teacher_bulk", {
      id: "teacher_bulk",
      schoolId: "school_1",
      isDeleted: false,
    });
    mockState.teacherAssignments.set("ta_1", {
      id: "ta_1",
      teacherId: "teacher_bulk",
      schoolId: "school_1",
      classId: "10",
      sectionId: "A",
    });

    mockState.results.set("r1", {
      id: "r1",
      schoolId: "school_1",
      studentId: "stu_1",
      studentName: "Student One",
      rollNumber: "1",
      classId: "10",
      sectionId: "A",
      examType: "UnitTest",
      examName: "Unit Test 1",
      subject: "Math",
      marksObtained: 85,
      totalMarks: 100,
      published: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockState.results.set("r2", {
      id: "r2",
      schoolId: "school_1",
      studentId: "stu_2",
      studentName: "Student Two",
      rollNumber: "2",
      classId: "10",
      sectionId: "A",
      examType: "UnitTest",
      examName: "Unit Test 1",
      subject: "Science",
      marksObtained: 78,
      totalMarks: 100,
      published: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockState.results.set("r3", {
      id: "r3",
      schoolId: "school_1",
      studentId: "stu_3",
      studentName: "Student Three",
      rollNumber: "3",
      classId: "10",
      sectionId: "A",
      examType: "UnitTest",
      examName: "Unit Test 1",
      subject: "English",
      marksObtained: 91,
      totalMarks: 100,
      published: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockVerifyIdToken.mockResolvedValueOnce({ uid: "admin_1", email: "admin_1@school.test" });
    const publish = await request(app.server)
      .patch("/api/v1/results/bulk-publish")
      .set("Authorization", "Bearer token")
      .send({ teacherId: "teacher_bulk" })
      .expect(200);

    expect(publish.body.success).toBe(true);
    expect(publish.body.data.updated).toBe(2);
  });
});
