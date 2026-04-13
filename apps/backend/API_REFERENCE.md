# SuffaCampus Backend â€” API Reference

> **Base URL:** `http://localhost:5000`  
> **API Version:** v1 â€” all routes prefixed with `/api/v1`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Students](#students)
3. [Teachers](#teachers)
4. [Classes](#classes)
5. [Attendance](#attendance)
6. [Events](#events)
7. [Fees](#fees)
8. [Library](#library)
9. [Results](#results)
10. [Timetable](#timetable)
11. [Dashboard](#dashboard)
12. [Settings](#settings)
13. [Subscriptions](#subscriptions)
14. [Payments](#payments)
15. [Users (Admin)](#users-admin)
16. [Admin â€” Schools (SuperAdmin)](#admin--schools-superadmin)
17. [Exports](#exports)
18. [Notifications](#notifications)
19. [Uploads (Storage)](#uploads-storage)
20. [Webhooks](#webhooks)
21. [Health & Metrics](#health--metrics)

---

## Common Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "uuid" }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "meta": { "requestId": "uuid" }
}
```

Paginated responses include:

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "cursor": "next-cursor-value",
    "hasMore": true,
    "limit": 20
  }
}
```

---

## Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes (protected routes) | `Bearer <Firebase ID Token>` |
| `X-School-Id` | Yes (tenant routes) | School document ID |
| `X-Request-Id` | No | Client-provided trace ID (auto-generated if absent) |
| `X-API-Key` | Some | For machine-to-machine calls |

---

## Authentication

### `GET /api/v1/auth/user-by-username`

Resolve username â†’ email + role (for mobile login flow).

**Query:** `?username=john_doe`

**Response:**
```json
{
  "email": "john@example.com",
  "role": "Teacher",
  "name": "John Doe",
  "studentId": null
}
```

### `GET /api/v1/auth/schools`

Verify a school code exists.

**Query:** `?code=SCH001`

---

## Students

> **Auth:** Bearer Token + X-School-Id  
> **Roles:** Admin, Teacher, SuperAdmin

### `GET /api/v1/students`

List students with pagination & filters.

**Query Params:**
- `limit` (default: 20, max: 100)
- `cursor` â€” pagination cursor
- `class` â€” filter by class
- `section` â€” filter by section
- `search` â€” search name/admission number
- `status` â€” `active` | `inactive`
- `sortBy` â€” `name` | `admissionNumber` | `createdAt`
- `sortOrder` â€” `asc` | `desc`

### `GET /api/v1/students/:id`

Get single student by ID.

### `POST /api/v1/students`

Create a student. Body must pass Zod validation.

### `PATCH /api/v1/students/:id`

Update a student. Partial update.

### `DELETE /api/v1/students/:id`

Soft-delete a student.

---

## Teachers

> **Auth:** Bearer Token + X-School-Id  
> **Roles:** Admin, SuperAdmin

### `GET /api/v1/teachers`
### `GET /api/v1/teachers/:id`
### `POST /api/v1/teachers`
### `PATCH /api/v1/teachers/:id`
### `DELETE /api/v1/teachers/:id`

Same CRUD pattern as Students.

---

## Classes

> **Auth:** Bearer Token + X-School-Id  
> **Roles:** Admin, SuperAdmin

### `GET /api/v1/classes`
### `GET /api/v1/classes/:id`
### `POST /api/v1/classes`
### `PATCH /api/v1/classes/:id`
### `DELETE /api/v1/classes/:id`
### `POST /api/v1/classes/:id/sections`

Add a section to a class.

### `DELETE /api/v1/classes/:id/sections/:section`

Remove a section from a class.

---

## Attendance

> **Auth:** Bearer Token + X-School-Id  
> **Roles:** Admin, Teacher, SuperAdmin

### `GET /api/v1/attendance`

List attendance records with filters (classId, sectionId, date, studentId).

### `POST /api/v1/attendance`

Mark attendance for a single student.

### `POST /api/v1/attendance/bulk`

Bulk attendance for an entire class/section.

```json
{
  "classId": "class-id",
  "sectionId": "section-id",
  "date": "2024-01-15",
  "entries": [
    { "studentId": "s1", "status": "Present" },
    { "studentId": "s2", "status": "Absent" },
    { "studentId": "s3", "status": "Late", "remarks": "10 min late" }
  ]
}
```

### `GET /api/v1/attendance/stats`

Attendance statistics with filters.

**Query:** `?classId=...&sectionId=...&fromDate=...&toDate=...`

---

## Events

### `GET /api/v1/events`
### `GET /api/v1/events/:id`
### `POST /api/v1/events`
### `PATCH /api/v1/events/:id`
### `DELETE /api/v1/events/:id`

---

## Fees

### `GET /api/v1/fees`
### `GET /api/v1/fees/:id`
### `POST /api/v1/fees`
### `PATCH /api/v1/fees/:id`
### `DELETE /api/v1/fees/:id`

---

## Library

### `GET /api/v1/library`
### `GET /api/v1/library/:id`
### `POST /api/v1/library`
### `PATCH /api/v1/library/:id`
### `DELETE /api/v1/library/:id`
### `POST /api/v1/library/:id/issue`

Issue a book to a student.

```json
{ "studentId": "student-id", "dueDate": "2024-02-15" }
```

### `POST /api/v1/library/:id/return`

Return a book. Optional fine.

```json
{ "transactionId": "tx-id", "fine": 50 }
```

---

## Results

### `GET /api/v1/results`
### `GET /api/v1/results/:id`
### `POST /api/v1/results`
### `PATCH /api/v1/results/:id`
### `DELETE /api/v1/results/:id`

---

## Timetable

### `GET /api/v1/timetable`
### `GET /api/v1/timetable/:id`
### `POST /api/v1/timetable`
### `PATCH /api/v1/timetable/:id`
### `DELETE /api/v1/timetable/:id`
### `GET /api/v1/timetable/lookup`

Lookup by class + section + day.

**Query:** `?classId=...&sectionId=...&day=Monday`

---

## Dashboard

### `GET /api/v1/dashboard/stats`

Aggregated counts (students, teachers, classes, events, fees collected).

### `GET /api/v1/dashboard/activity`

Recent activity feed (last 20 actions).

### `GET /api/v1/dashboard/upcoming-events`

Next 5 upcoming events.

---

## Settings

> **Roles:** Admin, SuperAdmin

### `GET /api/v1/settings`

Get school settings.

### `PATCH /api/v1/settings`

Update school settings (partial merge).

---

## Subscriptions

> **Roles:** Admin, SuperAdmin

### `GET /api/v1/subscriptions/status`

Current subscription state (plan, status, period, limits).

### `POST /api/v1/subscriptions/cancel`

Cancel subscription at end of current period.

```json
{ "reason": "Optional cancellation reason" }
```

### `GET /api/v1/subscriptions/invoices`

List invoices. Query: `?limit=50`

### `GET /api/v1/subscriptions/invoices/:invoiceId`

Single invoice detail.

### `GET /api/v1/subscriptions/usage`

Current usage vs plan limits (students, teachers, classes).

---

## Payments

### `POST /api/v1/payments/create-order`

Create a Razorpay order.

Server computes and enforces amount from `plan` + `billingCycle`; frontend amount is never trusted.

Headers:
- `Idempotency-Key: <unique-request-key>` (recommended)

```json
{
  "plan": "pro",
  "billingCycle": "monthly",
  "durationDays": 30
}
```

Example success response:

```json
{
  "success": true,
  "data": {
    "order": {
      "id": "order_Q2k...",
      "amount": 249900,
      "currency": "INR",
      "receipt": "rcpt_school_..."
    },
    "id": "order_Q2k...",
    "amount": 249900,
    "currency": "INR",
    "receipt": "rcpt_school_..."
  }
}
```

### `POST /api/v1/payments/verify`

Verify Razorpay payment signature server-side, fetch payment from gateway, and persist transaction idempotently.

```json
{
  "razorpay_order_id": "order_Q2k...",
  "razorpay_payment_id": "pay_Q2m...",
  "razorpay_signature": "f77a..."
}
```

Example success response:

```json
{
  "success": true,
  "data": {
    "verified": true,
    "duplicate": false,
    "paymentId": "pay_Q2m...",
    "orderId": "order_Q2k..."
  }
}
```

### `POST /webhooks/razorpay`

Public Razorpay webhook endpoint.
- Signature header required: `x-razorpay-signature`
- Event handled: `payment.captured`
- Processing is idempotent (duplicate capture events are safely ignored)

---

## Users (Admin)

> **Roles:** Admin, SuperAdmin

### `GET /api/v1/users`
### `GET /api/v1/users/:id`
### `POST /api/v1/users`

Creates Firebase Auth user + Firestore user doc + custom claims.

```json
{
  "email": "teacher@school.com",
  "password": "securepass123",
  "name": "Jane Teacher",
  "role": "Teacher",
  "phone": "+911234567890"
}
```

### `PATCH /api/v1/users/:id`
### `DELETE /api/v1/users/:id`

Deactivates (disables Firebase Auth + sets isActive=false).

---

## Admin â€” Schools (SuperAdmin)

> **Roles:** SuperAdmin only  
> No X-School-Id required (operates across tenants)

### `GET /api/v1/admin/schools`

List all schools. Filters: `?status=active&plan=Standard&search=...`

### `GET /api/v1/admin/stats`

Platform-wide statistics.

### `POST /api/v1/admin/schools`

Create a new school (auto-generates code, sets 14-day trial).

### `GET /api/v1/admin/schools/:id`
### `PATCH /api/v1/admin/schools/:id`
### `DELETE /api/v1/admin/schools/:id`

### `PATCH /api/v1/admin/schools/:id/plan`

Change a school's subscription plan and limits.

```json
{
  "plan": "Premium",
  "limits": {
    "maxStudents": 5000,
    "maxTeachers": 200,
    "maxClasses": 100
  }
}
```

---

## Exports

> **Roles:** Admin, Teacher, SuperAdmin

### `GET /api/v1/exports`

List available export templates and their columns.

### `GET /api/v1/exports/:template`

Download CSV export. Templates: `students`, `teachers`, `fees`, `attendance`, `results`.

**Query:** `?limit=10000&class=10&section=A`

**Response:** CSV file download (`Content-Type: text/csv`).

---

## Notifications

### `GET /api/v1/notifications`

List notifications for current user. Query: `?limit=50&unreadOnly=true`

### `GET /api/v1/notifications/unread-count`

Get unread notification count.

### `PATCH /api/v1/notifications/:id/read`

Mark a notification as read.

### `POST /api/v1/notifications/read-all`

Mark all notifications as read.

---

## Uploads (Storage)

> **Roles:** Admin, Teacher, SuperAdmin

### `POST /api/v1/uploads/:category`

Upload a file. Categories: `photos`, `documents`, `reports`, `receipts`, `imports`.

**Content-Type:** `multipart/form-data`  
**Field:** `file`

Size limits: photos 5MB, documents/reports 25MB, receipts 10MB, imports 50MB.

Successful response:

```json
{ "url": "https://storage.googleapis.com/<bucket>/<schoolId>/photos/<generated-file>" }
```

### `GET /api/v1/uploads/:category`

List files in a category.

### `GET /api/v1/uploads/usage`

Get total storage usage for the school.

### `POST /api/v1/uploads/signed-url`

Get a signed download URL.

```json
{ "storagePath": "schoolId/photos/file.jpg", "expiresInMinutes": 60 }
```

### `DELETE /api/v1/uploads`

Delete a file (Admin/SuperAdmin only).

```json
{ "storagePath": "schoolId/photos/file.jpg" }
```

---

## Webhooks

### `POST /webhooks/razorpay`

Razorpay webhook endpoint. Handles:
- `payment.captured` â€” activates subscription, creates invoice
- `payment.failed` â€” increments failure count, logs error
- `refund.created` â€” marks invoice as refunded, logs audit

**Signature:** `X-Razorpay-Signature` header (HMAC-SHA256).

### `POST /webhooks/retry/:failureId`

Manually retry a failed webhook (Admin/SuperAdmin).

---

## Health & Metrics

### `GET /health`

Shallow liveness check (always 200 if process is alive).

### `GET /health/live`

Kubernetes liveness probe alias.

### `GET /health/ready`

Deep readiness check â€” validates Firestore connectivity, system metrics.

```json
{
  "status": "healthy",
  "dependencies": {
    "firestore": { "status": "healthy", "latencyMs": 45 },
    "razorpay": { "status": "healthy" }
  },
  "system": {
    "uptime": 3600,
    "memory": { "rss": 120, "heapUsed": 80, "heapTotal": 150 }
  }
}
```

### `GET /metrics`

In-process request metrics (counts, latencies, error rates per route).

**Auth:** `Authorization: Bearer <METRICS_AUTH_TOKEN>` (required).

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `TOKEN_MISSING` | 401 | No Authorization header |
| `TOKEN_INVALID` | 401 | Invalid/expired Firebase token |
| `SCHOOL_HEADER_MISSING` | 400 | Missing X-School-Id header |
| `INSUFFICIENT_ROLE` | 403 | User role not allowed |
| `SUBSCRIPTION_EXPIRED` | 403 | School subscription has expired |
| `LIMIT_EXCEEDED` | 403 | Usage limit reached for this plan |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request body validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## Rate Limiting

- **General:** 100 requests/minute per IP
- **Auth routes:** 20 requests/minute per IP
- **Webhooks:** No rate limit (signature-verified)

---

## Environment Variables

See `.env.example` for the complete list.

