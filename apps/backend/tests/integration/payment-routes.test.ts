/**
 * Integration tests for payment routes.
 *
 * Tests: POST /payments/create-order
 */

import Fastify, { type FastifyInstance } from "fastify";
import paymentRoutes from "../../src/routes/v1/payments";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/payment.service", () => ({
  createOrder: jest.fn().mockResolvedValue({
    id: "order_mock_123",
    amount: 50000,
    currency: "INR",
    receipt: "rcpt_mock",
  }),
}));

jest.mock("../../src/lib/prisma", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getDoc } = require("../__mocks__/firebase-admin");

  return {
    prisma: {
      user: {
        findUnique: jest.fn(
          async ({ where: { uid } }: { where: { uid: string } }) => {
            const doc = getDoc("users", uid) as Record<string, unknown> | undefined;
            if (!doc) return null;

            return {
              uid,
              email: (doc.email as string | undefined) ?? "",
              role: (doc.role as string | undefined) ?? null,
              schoolId: (doc.schoolId as string | undefined) ?? null,
              isActive: (doc.isActive as boolean | undefined) ?? true,
            };
          }
        ),
      },
      invoice: {
        findFirst: jest.fn(async () => null),
      },
      legacyPayment: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        create: jest.fn(async () => ({
          id: "payment_1",
          amount: 0,
          method: "upi",
          status: "pending",
        })),
      },
    },
  };
});

let server: FastifyInstance;
const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

function setupAuthUser(role = "Admin", schoolId = "school_1") {
  mockVerifyIdToken.mockResolvedValueOnce({ uid: "user_1", email: "admin@school.com" });
  seedDoc("users", "user_1", {
    uid: "user_1",
    email: "admin@school.com",
    role,
    schoolId,
    status: "active",
    isActive: true,
  });
}

function seedSchool(schoolId = "school_1") {
  seedDoc("schools", schoolId, {
    name: "Test School", subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

beforeEach(async () => {
  resetFirestoreMock();
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
  await server.register(paymentRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /payments/create-order
// ---------------------------------------------------------------------------
describe("POST /payments/create-order", () => {
  it("creates a payment order and returns 201", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/payments/create-order",
      headers: { authorization: "Bearer token" },
      payload: { amount: 50000, plan: "pro" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.order).toHaveProperty("id");
    expect(body.data.order.amount).toBe(50000);
  });

  it("returns 400 for missing amount", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/payments/create-order",
      headers: { authorization: "Bearer token" },
      payload: { plan: "pro" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for negative amount", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/payments/create-order",
      headers: { authorization: "Bearer token" },
      payload: { amount: -100, plan: "pro" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for missing plan", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/payments/create-order",
      headers: { authorization: "Bearer token" },
      payload: { amount: 50000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({
      method: "POST", url: "/payments/create-order",
      payload: { amount: 50000, plan: "pro" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/payments/create-order",
      headers: { authorization: "Bearer token" },
      payload: { amount: 50000, plan: "pro" },
    });
    expect(res.statusCode).toBe(403);
  });
});
