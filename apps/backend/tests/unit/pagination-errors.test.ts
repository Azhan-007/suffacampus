/**
 * Unit tests for pagination schema and AppError system.
 */

import { paginationSchema } from "../../src/utils/pagination";
import { AppError, Errors } from "../../src/errors";

// ---------------------------------------------------------------------------
// Pagination schema
// ---------------------------------------------------------------------------

describe("paginationSchema", () => {
  it("defaults limit to 20 when omitted", () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it("parses a valid limit string", () => {
    const result = paginationSchema.parse({ limit: "50" });
    expect(result.limit).toBe(50);
  });

  it("caps limit at 100", () => {
    const result = paginationSchema.parse({ limit: "999" });
    expect(result.limit).toBe(100);
  });

  it("defaults limit to 20 for invalid values", () => {
    expect(paginationSchema.parse({ limit: "abc" }).limit).toBe(20);
    expect(paginationSchema.parse({ limit: "-5" }).limit).toBe(20);
    expect(paginationSchema.parse({ limit: "0" }).limit).toBe(20);
  });

  it("defaults sortOrder to desc", () => {
    const result = paginationSchema.parse({});
    expect(result.sortOrder).toBe("desc");
  });

  it("accepts asc sortOrder", () => {
    const result = paginationSchema.parse({ sortOrder: "asc" });
    expect(result.sortOrder).toBe("asc");
  });

  it("rejects invalid sortOrder", () => {
    const result = paginationSchema.safeParse({ sortOrder: "random" });
    expect(result.success).toBe(false);
  });

  it("transforms count to boolean", () => {
    expect(paginationSchema.parse({ count: "true" }).count).toBe(true);
    expect(paginationSchema.parse({ count: "false" }).count).toBe(false);
    expect(paginationSchema.parse({}).count).toBe(false);
  });

  it("passes through cursor and sortBy strings", () => {
    const result = paginationSchema.parse({
      cursor: "abc123",
      sortBy: "createdAt",
    });
    expect(result.cursor).toBe("abc123");
    expect(result.sortBy).toBe("createdAt");
  });
});

// ---------------------------------------------------------------------------
// AppError class
// ---------------------------------------------------------------------------

describe("AppError", () => {
  it("creates an error with statusCode, code, and message", () => {
    const err = new AppError(404, "RESOURCE_NOT_FOUND", "Student not found");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("RESOURCE_NOT_FOUND");
    expect(err.message).toBe("Student not found");
    expect(err.name).toBe("AppError");
  });

  it("includes details when provided", () => {
    const details = { field: "email", issue: "duplicate" };
    const err = new AppError(400, "VALIDATION_ERROR", "Bad input", details);
    expect(err.details).toEqual(details);
  });

  it("serializes to JSON correctly", () => {
    const err = new AppError(400, "VALIDATION_ERROR", "Bad", { x: 1 });
    const json = err.toJSON();
    expect(json).toEqual({
      code: "VALIDATION_ERROR",
      message: "Bad",
      details: { x: 1 },
    });
  });

  it("omits details from JSON when undefined", () => {
    const err = new AppError(500, "INTERNAL_ERROR", "Oops");
    const json = err.toJSON();
    expect(json).toEqual({
      code: "INTERNAL_ERROR",
      message: "Oops",
    });
    expect("details" in json).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Error factory (Errors object)
// ---------------------------------------------------------------------------

describe("Errors factory", () => {
  it("tokenMissing returns 401", () => {
    const err = Errors.tokenMissing();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTH_TOKEN_MISSING");
  });

  it("tokenInvalid returns 401", () => {
    const err = Errors.tokenInvalid();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTH_TOKEN_INVALID");
  });

  it("userNotFound returns 401", () => {
    const err = Errors.userNotFound();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("AUTH_USER_NOT_FOUND");
  });

  it("tenantMissing returns 403", () => {
    const err = Errors.tenantMissing();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("TENANT_MISSING");
  });

  it("insufficientRole includes required roles in details", () => {
    const err = Errors.insufficientRole(["Admin", "SuperAdmin"]);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("ROLE_UNAUTHORIZED");
    expect(err.details).toEqual({ required: ["Admin", "SuperAdmin"] });
  });

  it("subscriptionLimitReached includes resource and limit", () => {
    const err = Errors.subscriptionLimitReached("students", 100);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("SUBSCRIPTION_LIMIT_REACHED");
    expect(err.details).toEqual({ resource: "students", limit: 100 });
  });

  it("notFound returns 404 with resource name", () => {
    const err = Errors.notFound("Student", "abc123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Student");
    expect(err.message).toContain("abc123");
  });

  it("notFound works without id", () => {
    const err = Errors.notFound("Teacher");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("Teacher");
  });

  it("validation returns 400 with details", () => {
    const err = Errors.validation({ name: "required" });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ name: "required" });
  });

  it("internal returns 500", () => {
    const err = Errors.internal();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  it("paymentFailed returns 402", () => {
    const err = Errors.paymentFailed("Card declined");
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe("PAYMENT_FAILED");
  });

  it("rateLimitExceeded returns 429", () => {
    const err = Errors.rateLimitExceeded();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
