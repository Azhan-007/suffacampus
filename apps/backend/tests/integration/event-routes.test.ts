/**
 * Integration tests for event routes.
 *
 * Tests: POST /events, GET /events, GET /events/:id,
 *        PATCH /events/:id, DELETE /events/:id
 */

import Fastify, { type FastifyInstance } from "fastify";
import eventRoutes from "../../src/routes/v1/events";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  events: new Map<string, any>(),
  counter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    event: {
      create: jest.fn(async ({ data }) => {
        const id = `evt_${mockState.counter++}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
        mockState.events.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.events.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (where?.eventType && row.eventType !== where.eventType) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          if (where?.eventDate?.gte && String(row.eventDate) < String(where.eventDate.gte)) return false;
          return true;
        });

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "eventDate";
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
      findUnique: jest.fn(async ({ where: { id } }) => mockState.events.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.events.get(id);
        if (!existing) throw new Error("Event not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.events.set(id, updated);
        return updated;
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
    name: "Test School",
    subscriptionPlan: "Pro",
    subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function validEventPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Annual Sports Day",
    description: "Inter-house competition for all grades",
    eventDate: "2025-04-15",
    eventType: "Sports",
    targetAudience: ["Students", "Teachers"],
    ...overrides,
  };
}

function seedEvent(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.events.set(id, {
    id,
    schoolId,
    title: "Existing Event",
    description: "An existing event",
    eventDate: "2025-04-01",
    eventType: "Meeting",
    targetAudience: ["Staff"],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.events.clear();
  mockState.counter = 1;
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
  await server.register(eventRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /events
// ---------------------------------------------------------------------------
describe("POST /events", () => {
  it("creates an event and returns 201", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/events",
      headers: { authorization: "Bearer token" },
      payload: validEventPayload(),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.title).toBe("Annual Sports Day");
    expect(body.data.eventType).toBe("Sports");
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/events",
      headers: { authorization: "Bearer token" },
      payload: { title: "Only Title" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid eventType", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/events",
      headers: { authorization: "Bearer token" },
      payload: validEventPayload({ eventType: "InvalidType" }),
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "POST", url: "/events", payload: validEventPayload() });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();

    const res = await server.inject({
      method: "POST", url: "/events",
      headers: { authorization: "Bearer token" },
      payload: validEventPayload(),
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /events
// ---------------------------------------------------------------------------
describe("GET /events", () => {
  it("returns a paginated list of events", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_1");
    seedEvent("evt_2", "school_1", { title: "Another Event" });

    const res = await server.inject({
      method: "GET", url: "/events",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return events from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_other", "school_2");

    const res = await server.inject({
      method: "GET", url: "/events",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.length).toBe(0);
  });

  it("filters by eventType", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_sports", "school_1", { eventType: "Sports" });
    seedEvent("evt_holiday", "school_1", { eventType: "Holiday" });

    const res = await server.inject({
      method: "GET", url: "/events?eventType=Sports",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(1);
    expect(body.data[0].eventType).toBe("Sports");
  });
});

// ---------------------------------------------------------------------------
// GET /events/:id
// ---------------------------------------------------------------------------
describe("GET /events/:id", () => {
  it("returns a single event", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_1");

    const res = await server.inject({
      method: "GET", url: "/events/evt_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("evt_1");
  });

  it("returns 404 for non-existent event", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "GET", url: "/events/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for event in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_other", "school_2");

    const res = await server.inject({
      method: "GET", url: "/events/evt_other",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /events/:id
// ---------------------------------------------------------------------------
describe("PATCH /events/:id", () => {
  it("updates event fields", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_1");

    const res = await server.inject({
      method: "PATCH", url: "/events/evt_1",
      headers: { authorization: "Bearer token" },
      payload: { title: "Updated Title" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.title).toBe("Updated Title");
  });

  it("applies isActive default when body is empty (schema has default)", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_1");

    const res = await server.inject({
      method: "PATCH", url: "/events/evt_1",
      headers: { authorization: "Bearer token" },
      payload: {},
    });

    // {} parses to { isActive: true } due to schema default
    expect(res.statusCode).toBe(200);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedEvent("evt_1");

    const res = await server.inject({
      method: "PATCH", url: "/events/evt_1",
      headers: { authorization: "Bearer token" },
      payload: { title: "New" },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /events/:id
// ---------------------------------------------------------------------------
describe("DELETE /events/:id", () => {
  it("soft-deletes an event", async () => {
    setupAuthUser();
    seedSchool();
    seedEvent("evt_1");

    const res = await server.inject({
      method: "DELETE", url: "/events/evt_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(200);
    const doc = mockState.events.get("evt_1");
    expect(doc?.isActive).toBe(false);
  });

  it("returns 404 for non-existent event", async () => {
    setupAuthUser();
    seedSchool();

    const res = await server.inject({
      method: "DELETE", url: "/events/nonexistent",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedEvent("evt_1");

    const res = await server.inject({
      method: "DELETE", url: "/events/evt_1",
      headers: { authorization: "Bearer token" },
    });

    expect(res.statusCode).toBe(403);
  });
});
