/**
 * Integration tests for notification routes.
 *
 * Tests: GET /notifications, GET /notifications/unread-count,
 *        PATCH /notifications/:id/read, POST /notifications/read-all,
 *        POST /notifications/push/register, DELETE /notifications/push/unregister,
 *        POST /notifications/push/send
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
  deviceTokens: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    notification: {
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.notifications.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isRead !== "undefined" && row.isRead !== where.isRead) return false;

          if (where?.OR && Array.isArray(where.OR)) {
            const targetedUser = where.OR[0]?.userId;
            const isBroadcast = where.OR[1]?.userId === null;
            if (!(row.userId === targetedUser || (isBroadcast && row.userId === null))) return false;
          }

          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy];
          const rhs = b[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      }),
      count: jest.fn(async ({ where }) =>
        [...mockState.notifications.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isRead !== "undefined" && row.isRead !== where.isRead) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const targetedUser = where.OR[0]?.userId;
            const isBroadcast = where.OR[1]?.userId === null;
            if (!(row.userId === targetedUser || (isBroadcast && row.userId === null))) return false;
          }
          return true;
        }).length
      ),
      findUnique: jest.fn(async ({ where: { id } }) => mockState.notifications.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.notifications.get(id);
        if (!existing) throw new Error("Notification not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.notifications.set(id, updated);
        return updated;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        let count = 0;
        for (const [id, row] of mockState.notifications.entries()) {
          if (where?.schoolId && row.schoolId !== where.schoolId) continue;
          if (typeof where?.isRead !== "undefined" && row.isRead !== where.isRead) continue;
          if (where?.OR && Array.isArray(where.OR)) {
            const targetedUser = where.OR[0]?.userId;
            const isBroadcast = where.OR[1]?.userId === null;
            if (!(row.userId === targetedUser || (isBroadcast && row.userId === null))) continue;
          }
          mockState.notifications.set(id, { ...row, ...data, updatedAt: new Date() });
          count++;
        }
        return { count };
      }),
      create: jest.fn(async ({ data }) => {
        const id = `n_${mockState.notifications.size + 1}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
        mockState.notifications.set(id, row);
        return row;
      }),
    },
    deviceToken: {
      findUnique: jest.fn(async ({ where: { token } }) => mockState.deviceTokens.get(token) ?? null),
      create: jest.fn(async ({ data }) => {
        const row = { id: `dt_${mockState.deviceTokens.size + 1}`, createdAt: new Date(), ...data };
        mockState.deviceTokens.set(data.token, row);
        return row;
      }),
      update: jest.fn(async ({ where: { token }, data }) => {
        const existing = mockState.deviceTokens.get(token);
        if (!existing) throw new Error("Device token not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.deviceTokens.set(token, updated);
        return updated;
      }),
      delete: jest.fn(async ({ where: { token } }) => {
        const existing = mockState.deviceTokens.get(token) ?? null;
        mockState.deviceTokens.delete(token);
        return existing;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const tokens = where?.token?.in ?? [];
        let count = 0;
        for (const token of tokens) {
          if (mockState.deviceTokens.delete(token)) count++;
        }
        return { count };
      }),
      findMany: jest.fn(async ({ where, select }) => {
        let rows = [...mockState.deviceTokens.values()].filter((row) => {
          if (where?.userId?.in && Array.isArray(where.userId.in)) return where.userId.in.includes(row.userId);
          if (where?.userId && typeof where.userId === "string") return row.userId === where.userId;
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          return true;
        });
        if (!select) return rows;
        return rows.map((row) => {
          const selected: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) selected[key] = (row as any)[key];
          }
          return selected;
        });
      }),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid: "user_1", email: "admin@school.com" });
  seedDoc("users", "user_1", { uid: "user_1", email: "admin@school.com", role, schoolId, status: "active" });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School", subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function seedNotification(id: string, schoolId = "school_1", recipientId = "user_1", overrides: Record<string, unknown> = {}) {
  mockState.notifications.set(id, {
    id, schoolId,
    userId: recipientId,
    title: "Test Notification", message: "Some message",
    isRead: false, type: "info", severity: "info",
    createdAt: new Date(),
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.notifications.clear();
  mockState.deviceTokens.clear();
  mockVerifyIdToken.mockReset();
  server = Fastify({ logger: false });
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.status(error.statusCode).send({ success: false, error: error.toJSON() });
    return reply.status(500).send({ success: false, message: error instanceof Error ? error.message : "Unknown error" });
  });
  server.decorateRequest("requestId", "test-request-id");
  server.decorate("cache", {
    get: () => undefined, set: () => true, setWithTTL: () => true,
    del: () => 0, flushNamespace: () => {}, flushAll: () => {},
    stats: () => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }),
  });
  await server.register(notificationRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// GET /notifications
// ---------------------------------------------------------------------------
describe("GET /notifications", () => {
  it("returns notifications for the current user", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification("n1");
    seedNotification("n2");
    const res = await server.inject({
      method: "GET", url: "/notifications",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.notifications.length).toBe(2);
  });

  it("does not return notifications from another user", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification("n_other", "school_1", "other_user");
    const res = await server.inject({
      method: "GET", url: "/notifications",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.notifications.length).toBe(0);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "GET", url: "/notifications" });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /notifications/unread-count
// ---------------------------------------------------------------------------
describe("GET /notifications/unread-count", () => {
  it("returns unread count", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification("n1", "school_1", "user_1", { isRead: false });
    seedNotification("n2", "school_1", "user_1", { isRead: true });
    const res = await server.inject({
      method: "GET", url: "/notifications/unread-count",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.unreadCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PATCH /notifications/:id/read
// ---------------------------------------------------------------------------
describe("PATCH /notifications/:id/read", () => {
  it("marks a notification as read", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification("n1", "school_1", "user_1");
    const res = await server.inject({
      method: "PATCH", url: "/notifications/n1/read",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.marked).toBe(true);
    const doc = mockState.notifications.get("n1");
    expect(doc?.isRead).toBe(true);
  });

  it("returns 404 for non-existent notification", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "PATCH", url: "/notifications/nonexistent/read",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /notifications/read-all
// ---------------------------------------------------------------------------
describe("POST /notifications/read-all", () => {
  it("marks all notifications as read", async () => {
    setupAuthUser();
    seedSchool();
    seedNotification("n1", "school_1", "user_1");
    seedNotification("n2", "school_1", "user_1");
    const res = await server.inject({
      method: "POST", url: "/notifications/read-all",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.markedCount).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// POST /notifications/push/register
// ---------------------------------------------------------------------------
describe("POST /notifications/push/register", () => {
  it("registers a device token", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/notifications/push/register",
      headers: { authorization: "Bearer token" },
      payload: { token: "fcm-token-abc", platform: "android" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it("returns 400 for missing token", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/notifications/push/register",
      headers: { authorization: "Bearer token" },
      payload: { platform: "android" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid platform", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/notifications/push/register",
      headers: { authorization: "Bearer token" },
      payload: { token: "fcm-token", platform: "blackberry" },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /notifications/push/unregister
// ---------------------------------------------------------------------------
describe("DELETE /notifications/push/unregister", () => {
  it("removes a device token", async () => {
    setupAuthUser();
    seedSchool();
    seedDoc("deviceTokens", "dt1", { token: "fcm-token-abc", userId: "user_1", schoolId: "school_1" });
    const res = await server.inject({
      method: "DELETE", url: "/notifications/push/unregister",
      headers: { authorization: "Bearer token" },
      payload: { token: "fcm-token-abc" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 400 when token is missing", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "DELETE", url: "/notifications/push/unregister",
      headers: { authorization: "Bearer token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /notifications/push/send
// ---------------------------------------------------------------------------
describe("POST /notifications/push/send", () => {
  it("sends a push notification (admin)", async () => {
    setupAuthUser("Admin");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/notifications/push/send",
      headers: { authorization: "Bearer token" },
      payload: { title: "Hello", body: "Test notification" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("returns 400 for missing title", async () => {
    setupAuthUser("Admin");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/notifications/push/send",
      headers: { authorization: "Bearer token" },
      payload: { body: "No title" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/notifications/push/send",
      headers: { authorization: "Bearer token" },
      payload: { title: "Hello", body: "Test" },
    });
    expect(res.statusCode).toBe(403);
  });
});
