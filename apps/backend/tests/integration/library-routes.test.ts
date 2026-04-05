/**
 * Integration tests for library routes.
 *
 * Tests: POST /library/books, GET /library/books, GET /library/stats,
 *        GET /library/books/:id, PATCH /library/books/:id, DELETE /library/books/:id,
 *        POST /library/transactions, PATCH /library/transactions/:id/return,
 *        GET /library/transactions
 */

import Fastify, { type FastifyInstance } from "fastify";
import libraryRoutes from "../../src/routes/v1/library";
import {
  auth,
  resetFirestoreMock,
  seedDoc,
} from "../__mocks__/firebase-admin";
import { AppError } from "../../src/errors";

const mockState = {
  books: new Map<string, any>(),
  transactions: new Map<string, any>(),
  txCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async () => null),
    },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    book: {
      create: jest.fn(async ({ data }) => {
        const id = `book_${mockState.books.size + 1}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.books.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.books.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          if (where?.category && row.category !== where.category) return false;
          if (where?.availableCopies?.gt != null && !(row.availableCopies > where.availableCopies.gt)) return false;
          if (where?.OR && Array.isArray(where.OR)) {
            const search = String(
              where.OR[0]?.title?.contains ?? where.OR[1]?.author?.contains ?? where.OR[2]?.isbn?.contains ?? ""
            ).toLowerCase();
            if (search) {
              const title = String(row.title ?? "").toLowerCase();
              const author = String(row.author ?? "").toLowerCase();
              const isbn = String(row.isbn ?? "").toLowerCase();
              if (!title.includes(search) && !author.includes(search) && !isbn.includes(search)) return false;
            }
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
      findUnique: jest.fn(async ({ where: { id } }) => mockState.books.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.books.get(id);
        if (!existing) throw new Error("Book not found");

        const updated = { ...existing };
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in (value as Record<string, unknown>)) {
            updated[key] = Number(updated[key] ?? 0) + Number((value as Record<string, unknown>).increment ?? 0);
            continue;
          }
          if (value && typeof value === "object" && "decrement" in (value as Record<string, unknown>)) {
            updated[key] = Number(updated[key] ?? 0) - Number((value as Record<string, unknown>).decrement ?? 0);
            continue;
          }
          updated[key] = value;
        }

        updated.updatedAt = new Date();
        mockState.books.set(id, updated);
        return updated;
      }),
      aggregate: jest.fn(async ({ where, _sum }) => {
        void _sum;
        const rows = [...mockState.books.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          return true;
        });
        return {
          _count: rows.length,
          _sum: {
            totalCopies: rows.reduce((acc, row) => acc + Number(row.totalCopies ?? 0), 0),
            availableCopies: rows.reduce((acc, row) => acc + Number(row.availableCopies ?? 0), 0),
            issuedCount: rows.reduce((acc, row) => acc + Number(row.issuedCount ?? 0), 0),
          },
        };
      }),
      groupBy: jest.fn(async ({ by, where }) => {
        void by;
        const rows = [...mockState.books.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (typeof where?.isActive !== "undefined" && row.isActive !== where.isActive) return false;
          return true;
        });

        const grouped = new Map<string, number>();
        for (const row of rows) {
          const key = String(row.category ?? "Unknown");
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        }

        return [...grouped.entries()].map(([category, count]) => ({ category, _count: count }));
      }),
    },
    libraryTransaction: {
      create: jest.fn(async ({ data }) => {
        const id = `tx_${mockState.txCounter++}`;
        const row = {
          id,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        mockState.transactions.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, orderBy, take }) => {
        let rows = [...mockState.transactions.values()].filter((row) => {
          if (where?.schoolId && row.schoolId !== where.schoolId) return false;
          if (where?.bookId && row.bookId !== where.bookId) return false;
          if (where?.studentId && row.studentId !== where.studentId) return false;
          if (where?.status && row.status !== where.status) return false;
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
      findUnique: jest.fn(async ({ where: { id } }) => mockState.transactions.get(id) ?? null),
      update: jest.fn(async ({ where: { id }, data }) => {
        const existing = mockState.transactions.get(id);
        if (!existing) throw new Error("Transaction not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockState.transactions.set(id, updated);
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
    name: "Test School", subscriptionPlan: "Pro", subscriptionStatus: "active",
    limits: { students: 500, maxStudents: 500, maxTeachers: 50, maxClasses: 20 },
  });
}

function validBookPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Introduction to Algorithms",
    author: "Cormen et al.",
    category: "Computer Science",
    isbn: "978-0262033848",
    totalCopies: 5,
    ...overrides,
  };
}

function seedBook(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.books.set(id, {
    id, schoolId,
    title: "Existing Book", author: "Author", category: "Science",
    isbn: "978-0000000000", totalCopies: 5, availableCopies: 5, issuedCount: 0,
    status: "Available", isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function seedTransaction(id: string, schoolId = "school_1", overrides: Record<string, unknown> = {}) {
  mockState.transactions.set(id, {
    id, schoolId,
    bookId: "book_1", studentId: "stu_1",
    issueDate: "2025-03-01", dueDate: "2025-03-15",
    status: "Issued",
    createdAt: new Date(),
    ...overrides,
  });
}

beforeEach(async () => {
  resetFirestoreMock();
  mockState.books.clear();
  mockState.transactions.clear();
  mockState.txCounter = 1;
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
  await server.register(libraryRoutes, { prefix: "/" });
  await server.ready();
});

afterEach(async () => { await server.close(); });

// ---------------------------------------------------------------------------
// POST /library/books
// ---------------------------------------------------------------------------
describe("POST /library/books", () => {
  it("creates a book and returns 201", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/library/books",
      headers: { authorization: "Bearer token" },
      payload: validBookPayload(),
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
    expect(body.data.title).toBe("Introduction to Algorithms");
  });

  it("returns 400 for missing required fields", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/library/books",
      headers: { authorization: "Bearer token" },
      payload: { title: "Only" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await server.inject({ method: "POST", url: "/library/books", payload: validBookPayload() });
    expect(res.statusCode).toBe(401);
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/library/books",
      headers: { authorization: "Bearer token" },
      payload: validBookPayload(),
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /library/books
// ---------------------------------------------------------------------------
describe("GET /library/books", () => {
  it("returns a paginated list of books", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    seedBook("book_2", "school_1", { title: "Another Book" });
    const res = await server.inject({
      method: "GET", url: "/library/books",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return books from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/library/books",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /library/stats
// ---------------------------------------------------------------------------
describe("GET /library/stats", () => {
  it("returns library statistics", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "GET", url: "/library/stats",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /library/books/:id
// ---------------------------------------------------------------------------
describe("GET /library/books/:id", () => {
  it("returns a single book", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "GET", url: "/library/books/book_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.id).toBe("book_1");
  });

  it("returns 404 for non-existent book", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "GET", url: "/library/books/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for book in different school", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/library/books/book_other",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /library/books/:id
// ---------------------------------------------------------------------------
describe("PATCH /library/books/:id", () => {
  it("updates book fields", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "PATCH", url: "/library/books/book_1",
      headers: { authorization: "Bearer token" },
      payload: { title: "Updated Title" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.title).toBe("Updated Title");
  });

  it("rejects Teacher role", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "PATCH", url: "/library/books/book_1",
      headers: { authorization: "Bearer token" },
      payload: { title: "New" },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /library/books/:id
// ---------------------------------------------------------------------------
describe("DELETE /library/books/:id", () => {
  it("soft-deletes a book", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "DELETE", url: "/library/books/book_1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const doc = mockState.books.get("book_1");
    expect(doc?.isActive).toBe(false);
  });

  it("returns 404 for non-existent book", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "DELETE", url: "/library/books/nonexistent",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /library/transactions
// ---------------------------------------------------------------------------
describe("POST /library/transactions", () => {
  it("issues a book and returns 201", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "POST", url: "/library/transactions",
      headers: { authorization: "Bearer token" },
      payload: {
        bookId: "book_1", studentId: "stu_1",
        issueDate: "2025-03-01", dueDate: "2025-03-15",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("id");
  });

  it("returns 400 for missing fields", async () => {
    setupAuthUser();
    seedSchool();
    const res = await server.inject({
      method: "POST", url: "/library/transactions",
      headers: { authorization: "Bearer token" },
      payload: { bookId: "book_1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("allows Teacher role to issue books", async () => {
    setupAuthUser("Teacher");
    seedSchool();
    seedBook("book_1");
    const res = await server.inject({
      method: "POST", url: "/library/transactions",
      headers: { authorization: "Bearer token" },
      payload: {
        bookId: "book_1", studentId: "stu_1",
        issueDate: "2025-03-01", dueDate: "2025-03-15",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PATCH /library/transactions/:id/return
// ---------------------------------------------------------------------------
describe("PATCH /library/transactions/:id/return", () => {
  it("returns a book successfully", async () => {
    setupAuthUser();
    seedSchool();
    seedBook("book_1");
    seedTransaction("tx_1");
    const res = await server.inject({
      method: "PATCH", url: "/library/transactions/tx_1/return",
      headers: { authorization: "Bearer token" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /library/transactions
// ---------------------------------------------------------------------------
describe("GET /library/transactions", () => {
  it("returns a paginated list of transactions", async () => {
    setupAuthUser();
    seedSchool();
    seedTransaction("tx_1");
    seedTransaction("tx_2", "school_1", { studentId: "stu_2" });
    const res = await server.inject({
      method: "GET", url: "/library/transactions",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("does not return transactions from another school", async () => {
    setupAuthUser();
    seedSchool();
    seedTransaction("tx_other", "school_2");
    const res = await server.inject({
      method: "GET", url: "/library/transactions",
      headers: { authorization: "Bearer token" },
    });
    expect(JSON.parse(res.body).data.length).toBe(0);
  });
});
