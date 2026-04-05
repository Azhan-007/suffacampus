/*
 * k6 Load Test â€” SuffaCampus API
 *
 * Critical path: Login â†’ Dashboard â†’ Students CRUD â†’ Attendance â†’ Logout
 *
 * Run:
 *   k6 run k6/smoke.js                          # smoke (1 VU, 30s)
 *   k6 run --vus 50 --duration 2m k6/smoke.js    # load test
 *   k6 run k6/stress.js                          # stress ramp
 *
 * Env vars:
 *   BASE_URL        â€” API base (default http://localhost:5000)
 *   AUTH_TOKEN       â€” pre-generated Firebase ID token
 *   SCHOOL_ID        â€” tenant school ID for X-School-Id header
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const SCHOOL_ID = __ENV.SCHOOL_ID || "";

const errorRate = new Rate("errors");
const apiLatency = new Trend("api_latency", true);

export const options = {
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    errors: ["rate<0.05"],
  },
  // Smoke test defaults â€” override via CLI for load/stress
  vus: 1,
  duration: "30s",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers() {
  const h = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) h["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  if (SCHOOL_ID) h["X-School-Id"] = SCHOOL_ID;
  return h;
}

function apiGet(path, tag) {
  const res = http.get(`${BASE_URL}${path}`, {
    headers: headers(),
    tags: { name: tag },
  });
  apiLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  return res;
}

function apiPost(path, body, tag) {
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: headers(),
    tags: { name: tag },
  });
  apiLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  return res;
}

function apiPatch(path, body, tag) {
  const res = http.patch(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: headers(),
    tags: { name: tag },
  });
  apiLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  return res;
}

function apiDelete(path, tag) {
  const res = http.del(`${BASE_URL}${path}`, null, {
    headers: headers(),
    tags: { name: tag },
  });
  apiLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  return res;
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export default function () {
  group("Health checks", () => {
    const health = apiGet("/health", "GET /health");
    check(health, { "health 200": (r) => r.status === 200 });

    const ready = apiGet("/health/ready", "GET /health/ready");
    check(ready, { "ready 200 or 503": (r) => [200, 503].includes(r.status) });
  });

  sleep(0.5);

  group("Dashboard", () => {
    const res = apiGet("/api/v1/dashboard/stats", "GET /dashboard/stats");
    check(res, { "dashboard stats ok": (r) => r.status === 200 || r.status === 401 });
  });

  sleep(0.3);

  group("Students CRUD", () => {
    // List
    const list = apiGet("/api/v1/students?page=1&limit=20", "GET /students");
    check(list, { "students list": (r) => r.status === 200 || r.status === 401 });

    // Create (only if authenticated)
    if (AUTH_TOKEN) {
      const student = {
        firstName: `LoadTest_${Date.now()}`,
        lastName: "Student",
        dateOfBirth: "2010-05-15",
        gender: "male",
        classId: "class_demo",
        guardianName: "Test Parent",
        guardianPhone: "9876543210",
      };
      const created = apiPost("/api/v1/students", student, "POST /students");
      check(created, { "student created": (r) => [200, 201].includes(r.status) });

      if (created.status === 200 || created.status === 201) {
        try {
          const body = JSON.parse(created.body);
          const id = body.data?.id;
          if (id) {
            // Read
            const get = apiGet(`/api/v1/students/${id}`, "GET /students/:id");
            check(get, { "student get": (r) => r.status === 200 });

            // Update
            const patch = apiPatch(
              `/api/v1/students/${id}`,
              { lastName: "Updated" },
              "PATCH /students/:id"
            );
            check(patch, { "student updated": (r) => r.status === 200 });

            // Delete
            const del = apiDelete(`/api/v1/students/${id}`, "DELETE /students/:id");
            check(del, { "student deleted": (r) => r.status === 200 });
          }
        } catch (_) {
          /* ignore parse errors in load test */
        }
      }
    }
  });

  sleep(0.3);

  group("Attendance", () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = apiGet(
      `/api/v1/attendance?date=${today}&page=1&limit=50`,
      "GET /attendance"
    );
    check(res, { "attendance list": (r) => r.status === 200 || r.status === 401 });
  });

  sleep(0.3);

  group("Classes", () => {
    const res = apiGet("/api/v1/classes", "GET /classes");
    check(res, { "classes list": (r) => r.status === 200 || r.status === 401 });
  });

  sleep(0.3);

  group("Teachers", () => {
    const res = apiGet("/api/v1/teachers?page=1&limit=20", "GET /teachers");
    check(res, { "teachers list": (r) => r.status === 200 || r.status === 401 });
  });

  sleep(0.5);
}

