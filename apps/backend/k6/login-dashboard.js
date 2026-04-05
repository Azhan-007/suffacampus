/*
 * k6 Login + Dashboard Profile
 *
 * Focuses on the hottest pre-login and post-login paths:
 *   - GET /api/v1/auth/user-by-username
 *   - GET /api/v1/auth/schools
 *   - POST /api/v1/auth/login (requires AUTH_TOKEN)
 *   - GET /api/v1/dashboard/stats (requires AUTH_TOKEN + SCHOOL_ID)
 *
 * Run examples:
 *   k6 run k6/login-dashboard.js
 *   k6 run --vus 200 --duration 10m k6/login-dashboard.js
 *
 * Env vars:
 *   BASE_URL=http://localhost:5000
 *   SCHOOL_CODE=DEMO01
 *   USERNAME=teacher_demo
 *   AUTH_TOKEN=<firebase id token>
 *   SCHOOL_ID=<school id>
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const SCHOOL_CODE = (__ENV.SCHOOL_CODE || "DEMO01").trim();
const USERNAME = (__ENV.USERNAME || "teacher_demo").trim();
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const SCHOOL_ID = __ENV.SCHOOL_ID || "";

const errorRate = new Rate("profile_errors");
const authLookupLatency = new Trend("auth_lookup_latency_ms", true);
const authLoginLatency = new Trend("auth_login_latency_ms", true);
const dashboardLatency = new Trend("dashboard_latency_ms", true);

export const options = {
  scenarios: {
    auth_lookup_heavy: {
      executor: "constant-arrival-rate",
      rate: 120,
      timeUnit: "1s",
      duration: "10m",
      preAllocatedVUs: 80,
      maxVUs: 600,
      exec: "authLookupScenario",
    },
    login_dashboard_mix: {
      executor: "ramping-arrival-rate",
      startRate: 20,
      timeUnit: "1s",
      stages: [
        { target: 80, duration: "3m" },
        { target: 140, duration: "4m" },
        { target: 80, duration: "2m" },
        { target: 0, duration: "1m" },
      ],
      preAllocatedVUs: 80,
      maxVUs: 500,
      exec: "loginDashboardScenario",
    },
  },
  thresholds: {
    profile_errors: ["rate<0.05"],
    auth_lookup_latency_ms: ["p(95)<350", "p(99)<800"],
    auth_login_latency_ms: ["p(95)<500", "p(99)<1200"],
    dashboard_latency_ms: ["p(95)<600", "p(99)<1500"],
    http_req_failed: ["rate<0.05"],
  },
};

function authHeaders() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    "X-School-Id": SCHOOL_ID,
    "Content-Type": "application/json",
  };
}

export function authLookupScenario() {
  group("public-auth-lookups", () => {
    const userRes = http.get(
      `${BASE_URL}/api/v1/auth/user-by-username?username=${encodeURIComponent(USERNAME)}`,
      { tags: { name: "GET /auth/user-by-username" } }
    );

    authLookupLatency.add(userRes.timings.duration);
    errorRate.add(userRes.status >= 400);
    check(userRes, {
      "user lookup status ok": (r) => r.status === 200 || r.status === 404,
    });

    const schoolRes = http.get(
      `${BASE_URL}/api/v1/auth/schools?code=${encodeURIComponent(SCHOOL_CODE)}`,
      { tags: { name: "GET /auth/schools" } }
    );

    authLookupLatency.add(schoolRes.timings.duration);
    errorRate.add(schoolRes.status >= 400);
    check(schoolRes, {
      "school lookup status ok": (r) => r.status === 200 || r.status === 404,
    });
  });

  sleep(0.2);
}

export function loginDashboardScenario() {
  if (!AUTH_TOKEN || !SCHOOL_ID) {
    // Skip auth-required flow when token/schoolId are not provided.
    sleep(0.5);
    return;
  }

  group("authenticated-login-dashboard", () => {
    const loginRes = http.post(`${BASE_URL}/api/v1/auth/login`, "{}", {
      headers: authHeaders(),
      tags: { name: "POST /auth/login" },
    });

    authLoginLatency.add(loginRes.timings.duration);
    errorRate.add(loginRes.status >= 400);
    check(loginRes, {
      "auth login status ok": (r) => r.status === 200,
    });

    const dashboardRes = http.get(`${BASE_URL}/api/v1/dashboard/stats`, {
      headers: authHeaders(),
      tags: { name: "GET /dashboard/stats" },
    });

    dashboardLatency.add(dashboardRes.timings.duration);
    errorRate.add(dashboardRes.status >= 400);
    check(dashboardRes, {
      "dashboard status ok": (r) => r.status === 200,
    });
  });

  sleep(0.3);
}
