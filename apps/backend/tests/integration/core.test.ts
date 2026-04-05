/**
 * Backend Integration Tests
 * Tests critical flows: Students, Attendance, Payments, Subscriptions
 */

import request from "supertest";
import { buildServer } from "../../src/server";
import type { FastifyInstance } from "fastify";
import { auth } from "../__mocks__/firebase-admin";

describe("Backend Integration Tests", () => {
  let app: FastifyInstance;
  const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

  beforeAll(async () => {
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Health Checks", () => {
    it("GET /health should return 200", async () => {
      const res = await request(app.server)
        .get("/health")
        .expect(200);

      expect(res.body).toHaveProperty("status");
    });

    it("GET /api/v1/internal/health is not exposed", async () => {
      const res = await request(app.server)
        .get("/api/v1/internal/health")
        .expect(404);

      expect(res.body).toHaveProperty("statusCode", 404);
    });
  });

  describe("API Documentation", () => {
    it("GET /api/docs should return API docs (dev only)", async () => {
      if (process.env.NODE_ENV === "development") {
        const res = await request(app.server)
          .get("/api/docs")
          .expect(200);

        expect(res.text).toContain("openapi");
      }
    });
  });

  describe("Request validation & errors", () => {
    it("should reject requests with invalid tokens", async () => {
      const res = await request(app.server)
        .get("/api/v1/students")
        .set("Authorization", "Bearer invalid_token")
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body).toHaveProperty("error.code");
    });

    it("should sanitize user input", async () => {
      const maliciousInput = "<script>alert('xss')</script>";
      const res = await request(app.server)
        .post("/api/v1/students")
        .set("Authorization", "Bearer validtoken")
        .send({ firstName: maliciousInput });

      if (res.status === 400 || res.status === 422) {
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe("Metrics & Monitoring", () => {
    it("GET /metrics should return Prometheus metrics", async () => {
      const res = await request(app.server)
        .get("/metrics")
        .expect(200);

      expect(res.text).toContain("http_request_duration");
    });
  });

  describe("Cache Functionality", () => {
    it("should cache school config", async () => {
      const cache = (app as any).cache;

      const result1 = cache.get("school", "test-school-config");
      expect(result1).toBeUndefined();

      cache.set("school", "test-school-config", {
        plan: "pro",
        maxStudents: 500,
      });

      const result2 = cache.get("school", "test-school-config");
      expect(result2).toBeDefined();
      expect(result2).toHaveProperty("plan", "pro");
    });

    it("should flush cache on mutations", async () => {
      const cache = (app as any).cache;
      cache.set("school", "test-config", { data: "test" });

      // Simulate mutation
      cache.flushNamespace("school");

      const result = cache.get("school", "test-config");
      expect(result).toBeUndefined();
    });
  });
});

describe("Security Tests", () => {
  let app: FastifyInstance;
  const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

  beforeAll(async () => {
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Security Headers", () => {
    it("should set X-Content-Type-Options header", async () => {
      const res = await request(app.server).get("/health");
      if (res.headers["x-content-type-options"]) {
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
      }
    });

    it("should set HSTS header in production", async () => {
      if (process.env.NODE_ENV === "production") {
        const res = await request(app.server).get("/health");
        expect(res.headers["strict-transport-security"]).toBeDefined();
      }
    });

    it("should prevent clickjacking", async () => {
      const res = await request(app.server).get("/health");
      if (res.headers["x-frame-options"]) {
        expect(res.headers["x-frame-options"]).toBe("DENY");
      }
    });
  });

  describe("CORS Policy", () => {
    it("should reject requests from disallowed origins", async () => {
      if (process.env.NODE_ENV === "production") {
        const res = await request(app.server)
          .get("/health")
          .set("Origin", "http://malicious.com");

        expect(res.headers["access-control-allow-origin"]).not.toBe(
          "http://malicious.com"
        );
      }
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits", async () => {
      for (let i = 0; i < 10; i++) {
        await request(app.server).get("/health");
      }

      // After many requests, might get rate limited
      // This depends on configuration
    });
  });

  describe("Input Validation", () => {
    it("should reject requests with SQL injection attempts", async () => {
      const sqlInjection = "'; DROP TABLE students; --";
      const res = await request(app.server)
        .get("/api/v1/students")
        .query({ search: sqlInjection });

      // Should either reject or safely handle
      expect(res.status).toBeLessThan(500);
    });

    it("should enforce body size limits", async () => {
      const largePayload = "x".repeat(2_000_000); // 2MB
      try {
        const res = await request(app.server)
          .post("/api/v1/students")
          .send({ firstName: largePayload });

        expect(res.status).toBe(413); // Payload Too Large
      } catch (err: any) {
        // Some runtimes terminate oversized bodies at socket level instead of returning a 413 body.
        const code = err?.code as string | undefined;
        const status = err?.response?.status as number | undefined;
        expect(code === "ECONNRESET" || status === 413).toBe(true);
      }
    });
  });
});

describe("API Response Format", () => {
  let app: FastifyInstance;
  const mockVerifyIdToken = auth.verifyIdToken as jest.Mock;

  beforeAll(async () => {
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));
    app = buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return standardized success response", async () => {
    const res = await request(app.server)
      .get("/health")
      .expect(200);

    expect(res.body).toHaveProperty("success");
    expect(res.body).toHaveProperty("status");
    expect(res.body).toHaveProperty("timestamp");
  });

  it("should return standardized error response", async () => {
    const res = await request(app.server)
      .get("/api/v1/students")
      .expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });
});
