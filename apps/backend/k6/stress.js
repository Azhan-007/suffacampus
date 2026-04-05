/*
 * k6 Stress Test â€” SuffaCampus API
 *
 * Ramps from 1 â†’ 100 VUs over 10 minutes to find breaking points.
 * Monitors p95 latency, error rate, and throughput.
 *
 * Run:
 *   k6 run k6/stress.js
 *
 * Env vars: BASE_URL, AUTH_TOKEN, SCHOOL_ID (see smoke.js)
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const SCHOOL_ID = __ENV.SCHOOL_ID || "";

const errorRate = new Rate("errors");
const apiLatency = new Trend("api_latency", true);
const requestCount = new Counter("api_requests");

export const options = {
  stages: [
    { duration: "1m", target: 10 },   // warm up
    { duration: "2m", target: 25 },   // ramp to moderate load
    { duration: "3m", target: 50 },   // sustained load
    { duration: "2m", target: 100 },  // peak stress
    { duration: "1m", target: 50 },   // step down
    { duration: "1m", target: 0 },    // cool down
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000", "p(99)<3000"],
    errors: ["rate<0.10"],
    http_req_failed: ["rate<0.10"],
  },
};

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
  requestCount.add(1);
  return res;
}

// ---------------------------------------------------------------------------
// Mixed workload simulating realistic traffic patterns
// ---------------------------------------------------------------------------

const ENDPOINTS = [
  { path: "/health", tag: "health" },
  { path: "/health/ready", tag: "health/ready" },
  { path: "/api/v1/dashboard/stats", tag: "dashboard" },
  { path: "/api/v1/students?page=1&limit=20", tag: "students" },
  { path: "/api/v1/teachers?page=1&limit=20", tag: "teachers" },
  { path: "/api/v1/classes", tag: "classes" },
  { path: "/api/v1/fees?page=1&limit=20", tag: "fees" },
  { path: "/api/v1/events?page=1&limit=10", tag: "events" },
  { path: "/api/v1/timetable", tag: "timetable" },
  { path: "/api/v1/library?page=1&limit=20", tag: "library" },
];

export default function () {
  // Pick 3-5 random endpoints per iteration (simulates real user browsing)
  const count = 3 + Math.floor(Math.random() * 3);
  const shuffled = ENDPOINTS.sort(() => Math.random() - 0.5).slice(0, count);

  for (const ep of shuffled) {
    const res = apiGet(ep.path, `GET ${ep.tag}`);
    check(res, {
      [`${ep.tag} status ok`]: (r) => r.status < 500,
    });
    sleep(0.2 + Math.random() * 0.5); // realistic think time
  }

  sleep(1);
}

