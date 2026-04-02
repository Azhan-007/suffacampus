/**
 * Integration tests for subscription routes.
 *
 * Tests the full HTTP lifecycle of subscription endpoints:
 * /subscriptions/status, /subscriptions/cancel, /subscriptions/usage, /subscriptions/invoices
 */

import Fastify, { type FastifyInstance } from "fastify";
import subscriptionRoutes from "../../src/routes/v1/subscriptions";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  schools: new Map<string, any>(),
  students: new Map<string, any>(),
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    school: {
      findUnique: jest.fn(async ({ where, select }) => {
        const row = mockState.schools.get(where.id) ?? null;
        if (!row) return null;
        if (!select) return row;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) selected[key] = (row as any)[key];
        }
        return selected;
      }),
      update: jest.fn(async ({ where, data }) => {
        const existing = mockState.schools.get(where.id);
        if (!existing) throw new Error("School not found");
        const updated = { ...existing, ...data };
        mockState.schools.set(where.id, updated);
        return updated;
      }),
      findMany: jest.fn(async () => []),
    },
    student: {
      count: jest.fn(async ({ where }) =>
        [...mockState.students.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isDeleted !== "undefined" && row.isDeleted !== where.isDeleted) return false;
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

// Mock invoice service
jest.mock("../../src/services/invoice.service", () => ({
  getInvoicesBySchool: jest.fn().mockResolvedValue([
    {
      id: "inv_1",
      invoiceNumber: "INV-TS-202602-001",
      amount: 1999,
      status: "paid",
      createdAt: new Date().toISOString(),
    },
  ]),
  getInvoiceById: jest.fn().mockImplementation(async (invoiceId: string, schoolId: string) => {
    if (invoiceId === "inv_1") {
      return {
        id: "inv_1",
        invoiceNumber: "INV-TS-202602-001",
        schoolId,
        amount: 1999,
        status: "paid",
      };
    }
    return null;
  }),
}));

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

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
  });
}

function seedSchool(
  schoolId = "school_1",
  overrides: Record<string, unknown> = {}
) {
  const school = {
    id: schoolId,
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    autoRenew: true,
    trialEndDate: null,
    currentPeriodStart: { toMillis: () => Date.now() - 15 * 86400000 },
    currentPeriodEnd: { toMillis: () => Date.now() + 15 * 86400000 },
    paymentFailureCount: 0,
    limits: {
      students: 500,
      maxStudents: 500,
      maxTeachers: 50,
      maxClasses: 20,
    },
    maxStudents: 500,
    maxTeachers: 50,
    ...overrides,
  };

  seedDoc("schools", schoolId, school);
  mockState.schools.set(schoolId, {
    ...school,
    currentPeriodStart: new Date(Date.now() - 15 * 86400000),
    currentPeriodEnd: new Date(Date.now() + 15 * 86400000),
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.schools.clear();
  mockState.students.clear();
  mockVerifyIdToken.mockReset();

  server = Fastify({ logger: false });

  // Global error handler
  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.toJSON(),
      });
    }
    const msg = error instanceof Error ? error.message : "Unknown error";
    return reply.status(500).send({ success: false, message: msg });
  });

  // Decorate request with requestId for response envelope
  server.decorateRequest("requestId", "test-request-id");

  // Decorate with a no-op cache (matches CacheService interface)
  server.decorate("cache", {
    get: () => undefined,
    set: () => true,
    setWithTTL: () => true,
    del: () => 0,
    flushNamespace: () => {},
    flushAll: () => {},
    stats: () => ({ hits: 0, misses: 0, keys: 0, ksize: 0, vsize: 0 }),
  });

  await server.register(subscriptionRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// GET /subscriptions/status
// ---------------------------------------------------------------------------

describe("GET /subscriptions/status", () => {
  it("returns current subscription status for authenticated admin", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/status",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.subscriptionPlan).toBe("Pro");
    expect(body.data.subscriptionStatus).toBe("active");
    expect(body.data.schoolId).toBe("school_1");
  });

  it("returns 404 if school does not exist", async () => {
    setupAuthUser();
    // Do NOT seed school

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/status",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/status",
    });

    expect(res.statusCode).toBe(401);
  });

  it("defaults to trial status when field is missing", async () => {
    setupAuthUser();
    seedDoc("schools", "school_1", { name: "New School" }); // No subscriptionStatus

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/status",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.subscriptionStatus).toBe("trial");
  });
});

// ---------------------------------------------------------------------------
// POST /subscriptions/cancel
// ---------------------------------------------------------------------------

describe("POST /subscriptions/cancel", () => {
  it("cancels an active subscription", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST",
      url: "/subscriptions/cancel",
      headers: { authorization: "Bearer token" },
      payload: { reason: "Too expensive" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("cancelEffectiveDate");
    expect(body.data.reason).toBe("Too expensive");

    // Verify status changed in Prisma mock state
    const school = mockState.schools.get("school_1");
    expect(school?.subscriptionStatus).toBe("cancelled");
  });

  it("returns error when cancelling non-active subscription", async () => {
    setupAuthUser();
    seedSchool("school_1", { subscriptionStatus: "trial" });

    const res = await server.inject({
      method: "POST",
      url: "/subscriptions/cancel",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// GET /subscriptions/invoices
// ---------------------------------------------------------------------------

describe("GET /subscriptions/invoices", () => {
  it("returns invoices for the school", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/invoices",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("invoices");
    expect(Array.isArray(body.data.invoices)).toBe(true);
    expect(body.data.count).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// GET /subscriptions/invoices/:invoiceId
// ---------------------------------------------------------------------------

describe("GET /subscriptions/invoices/:invoiceId", () => {
  it("returns a specific invoice", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/invoices/inv_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.invoice.id).toBe("inv_1");
  });

  it("returns 404 for non-existent invoice", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/invoices/inv_nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /subscriptions/usage
// ---------------------------------------------------------------------------

describe("GET /subscriptions/usage", () => {
  it("returns current usage stats", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET",
      url: "/subscriptions/usage",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("students");
    expect(body.data).toHaveProperty("teachers");
    expect(body.data).toHaveProperty("classes");
    expect(body.data.students).toHaveProperty("current");
    expect(body.data.students).toHaveProperty("limit");
    expect(body.data.plan).toBe("Pro");
  });
});
