/**
 * SuffaCampus Load Testing Suite (k6)
 * Tests: Student operations, Attendance marking, Fee management, Subscriptions
 * 
 * Run locally: k6 run load-tests/scenarios.js
 * Run with options: k6 run --vus 50 --duration 5m load-tests/scenarios.js
 * Generate HTML report: k6 run --out json=results.json && k6 convert results.json -o test.html
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Trend, Rate, Gauge } from "k6/metrics";

// Custom metrics
const errorRate = new Rate("errors");
const responseTime = new Trend("response_time");
const studentCreateTime = new Trend("student_create_time");
const attendanceMarkTime = new Trend("attendance_mark_time");
const feeQueryTime = new Trend("fee_query_time");
const dashboardLoadTime = new Trend("dashboard_load_time");
const concurrentErrors = new Counter("concurrent_errors");

// Configuration
const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const API_TOKEN = __ENV.API_TOKEN || "test-token-123";
const SCHOOL_ID = __ENV.SCHOOL_ID || "test-school-id";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${API_TOKEN}`,
};

// Test data generators
function generateStudent() {
  const id = Math.floor(Math.random() * 100000);
  return {
    firstName: `Student${id}`,
    lastName: `Test${id}`,
    email: `student${id}@test.school`,
    studentId: `STU-${id}`,
    classId: "class-10-a",
    rollNumber: id % 50,
    schoolId: SCHOOL_ID,
    dateOfBirth: "2010-01-15",
    parentEmail: `parent${id}@test.com`,
    parentPhone: "+91-9999999999",
  };
}

function generateAttendanceRecord() {
  const studentId = `stu-${Math.floor(Math.random() * 100)}`;
  return {
    studentId,
    classId: "class-10-a",
    date: new Date().toISOString().split("T")[0],
    status: ["present", "absent", "leave"][Math.floor(Math.random() * 3)],
    remarks: "Regular",
  };
}

// Scenario 1: Smoke Test (Sanity check)
export function smoke() {
  console.log("Starting smoke test...");

  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      "status is 200": (r) => r.status === 200,
      "response time < 500ms": (r) => r.timings.duration < 500,
    });
  });

  group("List Students", () => {
    const res = http.get(`${BASE_URL}/api/v1/students`, { headers });
    check(res, {
      "status is 200": (r) => r.status === 200,
      "response has data": (r) => JSON.parse(r.body).success === true,
    });
  });

  group("Create Student", () => {
    const student = generateStudent();
    const res = http.post(`${BASE_URL}/api/v1/students`, JSON.stringify(student), {
      headers,
    });
    check(res, {
      "status is 201": (r) => r.status === 201,
      "student created": (r) => JSON.parse(r.body).success === true,
    });
  });
}

// Scenario 2: Load Test (Sustained traffic)
export function load() {
  console.log("Starting load test...");

  group("Student Management", () => {
    // List students
    const listRes = http.get(
      `${BASE_URL}/api/v1/students?limit=50&skip=0`,
      { headers }
    );
    responseTime.add(listRes.timings.duration);
    check(listRes, {
      "list students 200": (r) => r.status === 200,
    });

    // Search students
    const searchRes = http.get(`${BASE_URL}/api/v1/students?search=John`, {
      headers,
    });
    responseTime.add(searchRes.timings.duration);
    check(searchRes, {
      "search students 200": (r) => r.status === 200,
    });

    // Create student
    const student = generateStudent();
    const createRes = http.post(
      `${BASE_URL}/api/v1/students`,
      JSON.stringify(student),
      { headers }
    );
    studentCreateTime.add(createRes.timings.duration);
    check(createRes, {
      "create student 201": (r) => r.status === 201,
    }) || errorRate.add(1);
  });

  group("Attendance Management", () => {
    // Mark attendance
    const attendance = generateAttendanceRecord();
    const markRes = http.post(
      `${BASE_URL}/api/v1/attendance`,
      JSON.stringify(attendance),
      { headers }
    );
    attendanceMarkTime.add(markRes.timings.duration);
    check(markRes, {
      "mark attendance 201": (r) => r.status === 201,
    }) || errorRate.add(1);

    // Get attendance stats
    const statsRes = http.get(
      `${BASE_URL}/api/v1/attendance/statistics/stu-001`,
      { headers }
    );
    responseTime.add(statsRes.timings.duration);
    check(statsRes, {
      "get attendance stats 200": (r) => r.status === 200,
    });
  });

  group("Fee Management", () => {
    // Get fees
    const feesRes = http.get(
      `${BASE_URL}/api/v1/fees?studentId=stu-001`,
      { headers }
    );
    feeQueryTime.add(feesRes.timings.duration);
    check(feesRes, {
      "get fees 200": (r) => r.status === 200,
    });
  });

  group("Dashboard", () => {
    // Load dashboard
    const dashRes = http.get(`${BASE_URL}/api/v1/dashboard`, { headers });
    dashboardLoadTime.add(dashRes.timings.duration);
    check(dashRes, {
      "dashboard 200": (r) => r.status === 200,
      "dashboard < 500ms": (r) => r.timings.duration < 500,
    }) || errorRate.add(1);
  });

  sleep(1);
}

// Scenario 3: Spike Test (Sudden traffic increase)
export function spike() {
  console.log("Starting spike test...");

  const concurrent = __VU; // Current virtual user number
  const isSpike = concurrent > 50; // Spike when more than 50 VUs

  if (isSpike) {
    console.log(`Spike detected: ${concurrent} concurrent users`);
    concurrentErrors.add(concurrent > 200 ? 1 : 0);
  }

  group("Concurrent Student Creation", () => {
    const students = [];
    for (let i = 0; i < 5; i++) {
      students.push(generateStudent());
    }

    const results = students.map((student) => {
      const res = http.post(
        `${BASE_URL}/api/v1/students`,
        JSON.stringify(student),
        { headers }
      );
      studentCreateTime.add(res.timings.duration);
      return res;
    });

    const successful = results.filter((r) => r.status === 201).length;
    check(successful, {
      "most creates successful": () => successful >= 4,
    });
  });

  group("Concurrent Attendance Marking", () => {
    const records = [];
    for (let i = 0; i < 10; i++) {
      records.push(generateAttendanceRecord());
    }

    const results = records.map((record) => {
      const res = http.post(
        `${BASE_URL}/api/v1/attendance`,
        JSON.stringify(record),
        { headers }
      );
      attendanceMarkTime.add(res.timings.duration);
      return res;
    });

    const successful = results.filter((r) => r.status === 201).length;
    check(successful, {
      "most attendance successful": () => successful >= 8,
    });
  });

  sleep(0.5);
}

// Scenario 4: Stress Test (Find breaking point)
export function stress() {
  console.log("Starting stress test...");

  group("Bulk Operations", () => {
    // Test with increasing payload
    const studentIds = Array.from({ length: 100 }, (_, i) => `stu-${i}`);

    const res = http.post(
      `${BASE_URL}/api/v1/attendance/analytics`,
      JSON.stringify({
        studentIds,
        startDate: "2024-01-01",
        endDate: "2024-03-31",
      }),
      { headers }
    );

    check(res, {
      "bulk operation completes": (r) => r.status === 200,
      "response time < 2000ms": (r) => r.timings.duration < 2000,
    }) || errorRate.add(1);
  });

  sleep(1);
}

// Scenario 5: Endurance Test (Long-running)
export function endurance() {
  console.log("Starting endurance test...");

  // Simulate realistic user behavior over longer period
  group("Realistic User Flow", () => {
    // 1. Load dashboard
    const dashRes = http.get(`${BASE_URL}/api/v1/dashboard`, { headers });
    dashboardLoadTime.add(dashRes.timings.duration);

    // 2. List students
    const listRes = http.get(
      `${BASE_URL}/api/v1/students?limit=20&skip=0`,
      { headers }
    );
    responseTime.add(listRes.timings.duration);

    // 3. View student details (simulate clicking on student)
    const detailRes = http.get(`${BASE_URL}/api/v1/students/stu-001`, {
      headers,
    });
    responseTime.add(detailRes.timings.duration);

    // 4. View attendance for student
    const attRes = http.get(
      `${BASE_URL}/api/v1/attendance/statistics/stu-001`,
      { headers }
    );
    responseTime.add(attRes.timings.duration);

    // 5. View fees
    const feesRes = http.get(`${BASE_URL}/api/v1/fees?studentId=stu-001`, {
      headers,
    });
    feeQueryTime.add(feesRes.timings.duration);
  });

  sleep(2);
}

// Scenario 6: Ramp Up Test (Gradual increase)
export function rampUp() {
  console.log("Starting ramp-up test...");

  const stage = Math.floor(__ITER / 10); // Stages every 10 iterations

  group(`Stage ${stage} - Load Test`, () => {
    const res = http.get(`${BASE_URL}/api/v1/students`, { headers });
    responseTime.add(res.timings.duration);
    check(res, {
      "status 200": (r) => r.status === 200,
      "response < 1000ms": (r) => r.timings.duration < 1000,
    }) || errorRate.add(1);
  });

  sleep(1);
}

// Test execution options
export const options = {
  scenarios: {
    smoke: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "1m",
      exec: "smoke",
      env: { SCENARIO: "smoke" },
    },
    load: {
      executor: "ramping-vus",
      stages: [
        { duration: "2m", target: 50 }, // 50 users over 2 minutes
        { duration: "5m", target: 50 }, // Stay at 50 for 5 minutes
        { duration: "2m", target: 100 }, // Ramp to 100
        { duration: "5m", target: 100 }, // Stay at 100 for 5 minutes
        { duration: "2m", target: 0 }, // Ramp down
      ],
      exec: "load",
    },
    spike: {
      executor: "ramping-vus",
      stages: [
        { duration: "1m", target: 10 }, // Warm up
        { duration: "30s", target: 200 }, // Spike to 200
        { duration: "1m", target: 10 }, // Cool down
      ],
      exec: "spike",
      startTime: "5m", // Start after load test
    },
    stress: {
      executor: "ramping-vus",
      stages: [
        { duration: "1m", target: 50 },
        { duration: "1m", target: 100 },
        { duration: "1m", target: 200 },
        { duration: "1m", target: 300 },
        { duration: "1m", target: 400 },
        { duration: "1m", target: 0 },
      ],
      exec: "stress",
      startTime: "15m",
    },
    endurance: {
      executor: "constant-vus",
      vus: 25,
      duration: "30m",
      exec: "endurance",
      startTime: "25m",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000", "p(99.9)<2000"],
    http_req_failed: ["rate<0.1"],
    errors: ["rate<0.05"],
    response_time: ["p(95)<500"],
    student_create_time: ["p(95)<1000"],
    attendance_mark_time: ["p(95)<800"],
    dashboard_load_time: ["p(95)<500"],
  },
};

// Export summary results
export function handleSummary(data) {
  return {
    "stdout": textSummary(data, { indent: " ", enableColors: true }),
    "results/results.json": JSON.stringify(data),
  };
}

function textSummary(data, options) {
  let summary = "\n=== Load Test Results ===\n";

  summary += `Total Request Duration: ${data.state.testRunDurationMs}ms\n`;
  summary += `Total Requests: ${data.metrics.http_reqs?.values?.count || 0}\n`;
  summary += `Request Errors: ${data.metrics.http_req_failed?.values?.rate || 0}%\n\n`;

  summary += "Endpoint Performance:\n";
  summary += `- Student Create: avg ${
    data.metrics.student_create_time?.values?.avg || 0
  }ms, p95 ${
    data.metrics.student_create_time?.values?.["p(95)"] || 0
  }ms\n`;
  summary += `- Attendance Mark: avg ${
    data.metrics.attendance_mark_time?.values?.avg || 0
  }ms, p95 ${
    data.metrics.attendance_mark_time?.values?.["p(95)"] || 0
  }ms\n`;
  summary += `- Dashboard Load: avg ${
    data.metrics.dashboard_load_time?.values?.avg || 0
  }ms, p95 ${
    data.metrics.dashboard_load_time?.values?.["p(95)"] || 0
  }ms\n`;
  summary += `- Fee Query: avg ${
    data.metrics.fee_query_time?.values?.avg || 0
  }ms\n\n`;

  summary += "SLA Status:\n";
  const httpReqDuration = data.metrics.http_req_duration?.thresholds;
  if (httpReqDuration) {
    summary += `âœ“ Response time p(95) < 500ms: ${httpReqDuration["p(95)<500"] ? "PASS" : "FAIL"}\n`;
    summary += `âœ“ Response time p(99) < 1000ms: ${httpReqDuration["p(99)<1000"] ? "PASS" : "FAIL"}\n`;
  }

  return summary;
}

// ====== Run Instructions ======
// 1. Smoke test (sanity):
//    k6 run -e BASE_URL=http://localhost:3001 -e API_TOKEN=xxx --scenario smoke load-tests/scenarios.js
//
// 2. Load test (50-100 VUs, 10+ min):
//    k6 run -e BASE_URL=http://localhost:3001 -e API_TOKEN=xxx --scenario load load-tests/scenarios.js
//
// 3. Spike test (sudden 200 users):
//    k6 run -e BASE_URL=http://localhost:3001 -e API_TOKEN=xxx --scenario spike load-tests/scenarios.js
//
// 4. Stress test (find breaking point):
//    k6 run -e BASE_URL=http://localhost:3001 -e API_TOKEN=xxx --scenario stress load-tests/scenarios.js
//
// 5. Endurance test (30 minutes @ 25 VUs):
//    k6 run -e BASE_URL=http://localhost:3001 -e API_TOKEN=xxx --scenario endurance load-tests/scenarios.js
//
// 6. Run all scenarios:
//    k6 run -e BASE_URL=http://localhost:3001 -e API_TOKEN=xxx load-tests/scenarios.js
//
// 7. With results export:
//    k6 run --out json=results.json load-tests/scenarios.js

