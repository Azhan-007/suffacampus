/**
 * Integration tests for notification routes.
 *
 * Tests: POST /notifications, GET /notifications,
 *        PATCH /notifications/:id/read, GET /notifications/unread-count
 */

import Fastify, { type FastifyInstance } from "fastify";
import notificationRoutes from "../../src/routes/v1/notifications";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  notifications: new Map<string, any>(),
  reads: new Map<string, { notificationId: string; userId: string; readAt: Date }>(),
  preferences: new Map<string, any>(),
  deviceTokens: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    notification: {
      create: jest.fn(async ({ data }) => {
        const id = `n_${mockState.notifications.size + 1}`;
        const row = { id, createdAt: new Date(), ...data, targetId: data.targetId ?? null };
        mockState.notifications.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, include, orderBy }) => {
        let rows = [...mockState.notifications.values()];
        if (where?.schoolId) rows = rows.filter((row) => row.schoolId === where.schoolId);
        if (where?.OR && Array.isArray(where.OR)) {
          rows = rows.filter((row) =>
            where.OR.some((cond: Record<string, unknown>) => {
              if (cond.targetType && row.targetType !== cond.targetType) return false;
              if (Object.prototype.hasOwnProperty.call(cond, "targetId") && row.targetId !== cond.targetId) return false;
              return true;
            })
          );
        }

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy];
          const rhs = b[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (include?.reads?.where?.userId) {
          const userId = include.reads.where.userId;
          rows = rows.map((row) => {
            const key = `${row.id}:${userId}`;
            const read = mockState.reads.get(key);
            return { ...row, reads: read ? [{ readAt: read.readAt }] : [] };
          });
        }

        return rows;
      }),
      findFirst: jest.fn(async ({ where }) => {
        return (
          [...mockState.notifications.values()].find(
            (row) => row.id === where?.id && row.schoolId === where?.schoolId
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }) => {
        let rows = [...mockState.notifications.values()];
        if (where?.schoolId) rows = rows.filter((row) => row.schoolId === where.schoolId);
        if (where?.OR && Array.isArray(where.OR)) {
          rows = rows.filter((row) =>
            where.OR.some((cond: Record<string, unknown>) => {
              if (cond.targetType && row.targetType !== cond.targetType) return false;
              if (Object.prototype.hasOwnProperty.call(cond, "targetId") && row.targetId !== cond.targetId) return false;
              return true;
            })
          );
        }
        if (where?.NOT?.reads?.some?.userId) {
          const userId = where.NOT.reads.some.userId;
          rows = rows.filter((row) => !mockState.reads.has(`${row.id}:${userId}`));
        }
        if (where?.reads?.none?.userId) {
          const userId = where.reads.none.userId;
          rows = rows.filter((row) => !mockState.reads.has(`${row.id}:${userId}`));
        }
        return rows.length;
      }),
    },
    notificationRead: {
      upsert: jest.fn(async ({ where, create }) => {
        const key = `${where.notificationId_userId.notificationId}:${where.notificationId_userId.userId}`;
        const existing = mockState.reads.get(key);
        if (existing) return existing;
        const row = { ...create, readAt: new Date() };
        mockState.reads.set(key, row);
        return row;
      }),
    },
    notificationPreference: {
      findUnique: jest.fn(async ({ where }) => {
        const key = `${where.userId_schoolId.userId}:${where.userId_schoolId.schoolId}`;
        return mockState.preferences.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }) => {
        const record = {
          id: `pref_${mockState.preferences.size + 1}`,
          attendanceEnabled: true,
          feesEnabled: true,
          resultsEnabled: true,
          generalEnabled: true,
          inAppEnabled: true,
          pushEnabled: true,
          emailEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        const key = `${data.userId}:${data.schoolId}`;
        mockState.preferences.set(key, record);
        return record;
      }),
    },
    deviceToken: {
      findFirst: jest.fn(async ({ where }) => {
        const rows = [...mockState.deviceTokens.values()];
        return (
          rows.find((row) => {
            if (where?.token && row.token !== where.token) return false;
            if (where?.userId && row.userId !== where.userId) return false;
            if (where?.schoolId && row.schoolId !== where.schoolId) return false;
            return true;
          }) ?? null
        );
      }),
      findMany: jest.fn(async ({ where, select, take }) => {
        let rows = [...mockState.deviceTokens.values()];
        if (where?.token) {
          if (typeof where.token === "string") {
            rows = rows.filter((row) => row.token === where.token);
          } else if (where.token.in && Array.isArray(where.token.in)) {
            rows = rows.filter((row) => where.token.in.includes(row.token));
          }
        }
        if (where?.userId) {
          if (typeof where.userId === "string") {
            rows = rows.filter((row) => row.userId === where.userId);
          } else if (where.userId.in && Array.isArray(where.userId.in)) {
            rows = rows.filter((row) => where.userId.in.includes(row.userId));
          }
        }
        if (where?.schoolId) {
          rows = rows.filter((row) => row.schoolId === where.schoolId);
        }

        if (typeof take === "number") {
          rows = rows.slice(0, take);
        }

        if (select?.token) {
          return rows.map((row) => ({ token: row.token }));
        }

        return rows;
      }),
      create: jest.fn(async ({ data }) => {
        const id = `dt_${mockState.deviceTokens.size + 1}`;
        const row = { id, createdAt: new Date(), ...data };
        mockState.deviceTokens.set(id, row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const rows = [...mockState.deviceTokens.values()];
        const toDelete = rows.filter((row) => {
          if (where?.token) {
            if (typeof where.token === "string") {
              if (row.token !== where.token) return false;
            } else if (where.token.in && Array.isArray(where.token.in)) {
              if (!where.token.in.includes(row.token)) return false;
            }
          }
          if (where?.userId && row.userId !== where.userId) return false;
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          return true;
        });

        toDelete.forEach((row) => {
          mockState.deviceTokens.delete(row.id);
        });

        return { count: toDelete.length };
      }),
      count: jest.fn(async ({ where }) => {
        let rows = [...mockState.deviceTokens.values()];
        if (where?.token) {
          rows = rows.filter((row) => row.token === where.token);
        }
        if (where?.schoolId) {
          rows = rows.filter((row) => row.schoolId === where.schoolId);
        }
        return rows.length;
      }),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1", uid = "user_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid, email: `${uid}@school.com` });
  seedDoc("users", uid, { uid, email: `${uid}@school.com`, role, schoolId, status: "active" });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function seedNotification(params: {
  id: string;
  schoolId: string;
  targetType: "USER" | "ROLE" | "SCHOOL";
  targetId?: string | null;
}) {
  mockState.notifications.set(params.id, {
    id: params.id,
    schoolId: params.schoolId,
    targetType: params.targetType,
    targetId: params.targetId ?? null,
    title: "Test Notification",
    message: "Message",
    type: "INFO",
    createdBy: "admin",
    createdAt: new Date(),
  });
}

function seedRead(notificationId: string, userId: string) {
  mockState.reads.set(`${notificationId}:${userId}`, {
    notificationId,
    userId,
    readAt: new Date(),
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.notifications.clear();
  mockState.reads.clear();
  mockState.preferences.clear();
  mockState.deviceTokens.clear();
  mockVerifyIdToken.mockReset();

  server = Fastify({ logger: false });
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    }
    return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : "Unknown error" });
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
  await server.register(notificationRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// POST /notifications
// ---------------------------------------------------------------------------

describe("POST /notifications", () => {
  it("creates a USER notification", async () => {
    setupAuthUser("Admin");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "Hello",
        message: "User message",
        type: "INFO",
        targetType: "USER",
        targetId: "user_2",
        referenceType: "FEE",
        referenceId: "fee_123",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.targetType).toBe("USER");
    expect(body.data.targetId).toBe("user_2");
    expect(body.data.referenceType).toBe("FEE");
    expect(body.data.referenceId).toBe("fee_123");
  });

  it("rejects partial reference payload when only referenceId is sent", async () => {
    setupAuthUser("Admin");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "Invalid ref",
        message: "Missing type",
        type: "INFO",
        targetType: "SCHOOL",
        referenceId: "fee_123",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("creates a ROLE notification", async () => {
    setupAuthUser("Admin");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "Role Notice",
        message: "Admin message",
        type: "ALERT",
        targetType: "ROLE",
        targetId: "Admin",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.targetType).toBe("ROLE");
    expect(body.data.targetId).toBe("Admin");
  });

  it("creates a SCHOOL notification", async () => {
    setupAuthUser("Admin");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "School Notice",
        message: "All users",
        type: "REMINDER",
        targetType: "SCHOOL",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.data.targetType).toBe("SCHOOL");
    expect(body.data.targetId).toBeNull();
  });

  it("rejects USER notification without targetId", async () => {
    setupAuthUser("Admin");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "Missing target",
        message: "User message",
        type: "INFO",
        targetType: "USER",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("allows ROLE notification when targetId differs from requester role", async () => {
    setupAuthUser("Admin");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "Mismatch",
        message: "Role mismatch",
        type: "INFO",
        targetType: "ROLE",
        targetId: "Teacher",
      },
    });

    expect(res.statusCode).toBe(201);
  });

  it("rejects non-admin/staff roles", async () => {
    setupAuthUser("Teacher");
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
      payload: {
        title: "Forbidden",
        message: "No",
        type: "INFO",
        targetType: "SCHOOL",
      },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /notifications
// ---------------------------------------------------------------------------

describe("GET /notifications", () => {
  it("returns USER, ROLE, and SCHOOL notifications", async () => {
    setupAuthUser("Admin", "school_1", "user_1");
    seedSchool();

    seedNotification({ id: "n1", schoolId: "school_1", targetType: "USER", targetId: "user_1" });
    seedNotification({ id: "n2", schoolId: "school_1", targetType: "ROLE", targetId: "Admin" });
    seedNotification({ id: "n3", schoolId: "school_1", targetType: "SCHOOL" });
    seedNotification({ id: "n4", schoolId: "school_1", targetType: "USER", targetId: "other" });
    seedNotification({ id: "n5", schoolId: "school_2", targetType: "SCHOOL" });
    seedRead("n1", "user_1");

    const res = await server.inject({
      method: "GET",
      url: "/notifications",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids = body.data.notifications.map((n: { id: string }) => n.id);
    expect(ids).toEqual(["n3", "n2", "n1"]);

    const userNotification = body.data.notifications.find((n: { id: string }) => n.id === "n1");
    expect(userNotification.isRead).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PATCH /notifications/:id/read
// ---------------------------------------------------------------------------

describe("PATCH /notifications/:id/read", () => {
  it("marks a notification as read", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification({ id: "n1", schoolId: "school_1", targetType: "USER", targetId: "user_1" });

    const res = await server.inject({
      method: "PATCH",
      url: "/notifications/n1/read",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockState.reads.size).toBe(1);
  });

  it("prevents duplicate reads", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification({ id: "n1", schoolId: "school_1", targetType: "USER", targetId: "user_1" });

    await server.inject({
      method: "PATCH",
      url: "/notifications/n1/read",
      headers: { authorization: "Bearer token" },
    });
    await server.inject({
      method: "PATCH",
      url: "/notifications/n1/read",
      headers: { authorization: "Bearer token" },
    });

    expect(mockState.reads.size).toBe(1);
  });

  it("returns 404 for another school's notification", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification({ id: "n2", schoolId: "school_2", targetType: "SCHOOL" });

    const res = await server.inject({
      method: "PATCH",
      url: "/notifications/n2/read",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /notifications/unread-count
// ---------------------------------------------------------------------------

describe("GET /notifications/unread-count", () => {
  it("returns unread count", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification({ id: "n1", schoolId: "school_1", targetType: "USER", targetId: "user_1" });
    seedNotification({ id: "n_role", schoolId: "school_1", targetType: "ROLE", targetId: "Admin" });
    seedNotification({ id: "n2", schoolId: "school_1", targetType: "SCHOOL" });
    seedRead("n1", "user_1");

    const res = await server.inject({
      method: "GET",
      url: "/notifications/unread-count",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.unreadCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// POST /notifications/push/register
// ---------------------------------------------------------------------------

describe("POST /notifications/push/register", () => {
  it("registers device token for current tenant user", async () => {
    setupAuthUser("Admin", "school_1", "user_1");
    seedSchool("school_1");

    const res = await server.inject({
      method: "POST",
      url: "/notifications/push/register",
      headers: { authorization: "Bearer token" },
      payload: {
        token: "fcm-token-1",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.token).toBe("fcm-token-1");
    expect(mockState.deviceTokens.size).toBe(1);
  });

  it("is idempotent for same user/school/token", async () => {
    setupAuthUser("Admin", "school_1", "user_1");
    seedSchool("school_1");

    await server.inject({
      method: "POST",
      url: "/notifications/push/register",
      headers: { authorization: "Bearer token" },
      payload: { token: "fcm-token-1" },
    });

    setupAuthUser("Admin", "school_1", "user_1");

    const res = await server.inject({
      method: "POST",
      url: "/notifications/push/register",
      headers: { authorization: "Bearer token" },
      payload: { token: "fcm-token-1" },
    });

    expect(res.statusCode).toBe(200);
    expect(mockState.deviceTokens.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// DELETE /notifications/push/unregister
// ---------------------------------------------------------------------------

describe("DELETE /notifications/push/unregister", () => {
  it("removes token only for current user and tenant context", async () => {
    setupAuthUser("Admin", "school_1", "user_1");
    seedSchool("school_1");

    mockState.deviceTokens.set("dt_1", {
      id: "dt_1",
      userId: "user_1",
      schoolId: "school_1",
      token: "fcm-token-1",
      createdAt: new Date(),
    });

    mockState.deviceTokens.set("dt_2", {
      id: "dt_2",
      userId: "user_2",
      schoolId: "school_1",
      token: "fcm-token-1",
      createdAt: new Date(),
    });

    const res = await server.inject({
      method: "DELETE",
      url: "/notifications/push/unregister",
      headers: { authorization: "Bearer token" },
      payload: {
        token: "fcm-token-1",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.removed).toBe(true);
    expect(mockState.deviceTokens.has("dt_1")).toBe(false);
    expect(mockState.deviceTokens.has("dt_2")).toBe(true);
  });
});
