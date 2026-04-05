# SuffaCampus Backend

Production-ready Fastify + TypeScript backend with Firebase Auth, Firestore, multi-tenant architecture, role-based access control, subscription enforcement, and Razorpay payment integration.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Fastify (with CORS, rate limiting)
- **Language:** TypeScript (strict mode)
- **Auth:** Firebase Admin SDK (ID token verification)
- **Database:** Cloud Firestore
- **Validation:** Zod
- **Payments:** Razorpay

## Project Structure

```
src/
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ firebase-admin.ts       # Firebase Admin singleton (auth + firestore + storage)
â”‚   â”œâ”€â”€ storage.ts              # Tenant-scoped storage path helpers
â”‚   â””â”€â”€ razorpay.ts             # Razorpay client singleton
â”œâ”€â”€ middleware/
â”‚   â”œâ”€â”€ auth.ts                 # Firebase token verification
â”‚   â”œâ”€â”€ tenant.ts               # Multi-tenant schoolId guard
â”‚   â”œâ”€â”€ role.ts                 # Role-based access control
â”‚   â””â”€â”€ subscription.ts         # Subscription plan limit enforcement
â”œâ”€â”€ routes/
â”‚   â”œâ”€â”€ students.ts             # Student CRUD routes
â”‚   â”œâ”€â”€ teachers.ts             # Teacher CRUD routes
â”‚   â”œâ”€â”€ attendance.ts           # Attendance marking + listing
â”‚   â”œâ”€â”€ payments.ts             # Razorpay order creation
â”‚   â”œâ”€â”€ webhooks.ts             # Razorpay webhook handler
â”‚   â”œâ”€â”€ webhook-retry.ts        # Manual webhook failure retry
â”‚   â””â”€â”€ debug.ts                # Debug route (temporary)
â”œâ”€â”€ schemas/
â”‚   â”œâ”€â”€ student.schema.ts       # Student Zod schema
â”‚   â”œâ”€â”€ teacher.schema.ts       # Teacher Zod schema
â”‚   â””â”€â”€ attendance.schema.ts    # Attendance Zod schema
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ student.service.ts      # Student Firestore operations
â”‚   â”œâ”€â”€ teacher.service.ts      # Teacher Firestore operations
â”‚   â”œâ”€â”€ attendance.service.ts   # Attendance Firestore operations
â”‚   â”œâ”€â”€ payment.service.ts      # Razorpay order + webhook handling
â”‚   â”œâ”€â”€ webhook-failure.service.ts  # Webhook failure logging + retry
â”‚   â””â”€â”€ audit.service.ts        # Audit log writer (fire-and-forget)
â””â”€â”€ server.ts                   # Fastify app entry point
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

```env
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=your_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# Firebase Storage (optional â€” defaults to project default bucket)
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# Server
PORT=5000
NODE_ENV=development
```

### 3. Run

```bash
# Development (hot-reload)
npm run dev

# Production build
npm run build
npm start
```

### 3.1 Load test scripts

```bash
# Smoke profile
npm run load:smoke

# General stress profile
npm run load:stress

# Focused auth + dashboard profile (school start peak simulation)
npm run load:auth-dashboard

# Windows helper (PowerShell)
./k6/run-auth-dashboard-load.ps1 -BaseUrl http://localhost:5000 -SchoolCode DEMO01 -Username teacher_demo -AuthToken <token> -SchoolId <school-id>
```

### 3.2 Critical endpoint overload guardrails

Configure these variables in production to protect login and dashboard latency under bursts:

```env
CRITICAL_AUTH_LOOKUP_CONCURRENCY=150
CRITICAL_AUTH_LOGIN_CONCURRENCY=120
CRITICAL_DASHBOARD_CONCURRENCY=220
```

When a lane is saturated, the API returns `503` with `OVERLOADED_RETRY_LATER` and `Retry-After: 1`.

### 4. Deploy Firestore indexes

```bash
firebase deploy --only firestore:indexes
```

## Observability and scaling docs

- `docs/observability/SCALING_RUNBOOK.md` â€” rollout, tuning, and success criteria
- `docs/observability/prometheus-alert-rules.yml` â€” alert rules for critical latency and overload shedding

Key metrics to monitor during peak traffic:

- `SuffaCampus_critical_request_duration_seconds`
- `SuffaCampus_critical_slow_requests_total`
- `SuffaCampus_auth_lookup_cache_events_total`
- `SuffaCampus_dashboard_query_duration_seconds`
- `SuffaCampus_overload_shed_requests_total`

## API Routes

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/webhooks/razorpay` | Razorpay webhook (signature verified) |

### Protected â€” Webhook Management

| Method | Endpoint | Roles | Middleware | Status |
|--------|----------|-------|-----------|--------|
| POST | `/webhooks/retry/:failureId` | SuperAdmin | auth â†’ role | 200 / 404 / 422 |

### Protected â€” Students

| Method | Endpoint | Roles | Middleware | Status |
|--------|----------|-------|-----------|--------|
| POST | `/students` | Admin, SuperAdmin | auth â†’ tenant â†’ role â†’ subscription | 201 |
| GET | `/students` | Any authenticated | auth â†’ tenant | 200 |
| GET | `/students/:id` | Any authenticated | auth â†’ tenant | 200 / 404 |
| DELETE | `/students/:id` | Admin, SuperAdmin | auth â†’ tenant â†’ role | 200 / 404 |

### Protected â€” Teachers

| Method | Endpoint | Roles | Middleware | Status |
|--------|----------|-------|-----------|--------|
| POST | `/teachers` | Admin, SuperAdmin | auth â†’ tenant â†’ role | 201 |
| GET | `/teachers` | Any authenticated | auth â†’ tenant | 200 |
| GET | `/teachers/:id` | Any authenticated | auth â†’ tenant | 200 / 404 |
| DELETE | `/teachers/:id` | Admin, SuperAdmin | auth â†’ tenant â†’ role | 200 / 404 |

### Protected â€” Attendance

| Method | Endpoint | Roles | Middleware | Status |
|--------|----------|-------|-----------|--------|
| POST | `/attendance` | Admin, SuperAdmin, Teacher | auth â†’ tenant â†’ role | 201 |
| GET | `/attendance?date=YYYY-MM-DD` | Admin, SuperAdmin, Teacher | auth â†’ tenant â†’ role | 200 |

### Protected â€” Payments

| Method | Endpoint | Roles | Middleware | Status |
|--------|----------|-------|-----------|--------|
| POST | `/payments/create-order` | Admin, SuperAdmin | auth â†’ tenant â†’ role | 201 |

### Protected â€” Debug

| Method | Endpoint | Middleware | Status |
|--------|----------|-----------|--------|
| GET | `/debug` | auth â†’ tenant | 200 |

## Middleware Pipeline

| Middleware | Purpose |
|-----------|---------|
| `authenticate` | Verifies Firebase ID token, fetches user from `users` collection, attaches `request.user` |
| `tenantGuard` | Extracts `schoolId` from `request.user`, attaches `request.schoolId`, rejects 403 if missing |
| `roleMiddleware(roles)` | Checks `user.role` is in `roles` array, rejects 403 if unauthorized |
| `enforceSubscription` | Fetches school doc, counts students, rejects 403 if plan limit reached (-1 = unlimited) |

## Firestore Collections

| Collection | Key Fields | Used By |
|------------|------------|---------|
| `users` | `uid`, `email`, `role`, `schoolId` | Auth middleware |
| `schools` | `subscriptionPlan`, `subscriptionStatus`, `currentPeriodStart`, `currentPeriodEnd`, `limits.students` | Subscription middleware, Webhook handler |
| `students` | `id`, `schoolId`, `firstName`, `lastName`, `classId`, `sectionId`, `rollNumber`, `parentPhone`, `gender`, `isDeleted`, `deletedAt`, `deletedBy` | Student service |
| `teachers` | `id`, `schoolId`, `firstName`, `lastName`, `email`, `department`, `subjects`, `isActive`, `isDeleted`, `deletedAt`, `deletedBy` | Teacher service |
| `attendance` | `id`, `schoolId`, `studentId`, `date`, `status`, `classId`, `sectionId`, `markedBy` | Attendance service |
| `invoices` | `id`, `schoolId`, `plan`, `razorpayPaymentId`, `razorpayOrderId`, `amount`, `currency`, `status`, `currentPeriodStart`, `currentPeriodEnd` | Webhook handler |
| `webhookFailures` | `id`, `eventType`, `razorpayEventId`, `schoolId`, `rawPayload`, `errorMessage`, `retryCount`, `status`, `createdAt`, `lastRetriedAt`, `resolvedAt` | Webhook failure service |
| `auditLogs` | `id`, `action`, `performedBy`, `schoolId`, `timestamp`, `metadata` | Audit service |

## Firestore Composite Indexes

| Collection | Fields |
|------------|--------|
| `students` | `schoolId` ASC + `createdAt` DESC |
| `students` | `schoolId` ASC + `isDeleted` ASC + `createdAt` DESC |
| `teachers` | `schoolId` ASC + `createdAt` DESC |
| `teachers` | `schoolId` ASC + `isDeleted` ASC + `createdAt` DESC |
| `attendance` | `schoolId` ASC + `date` ASC |
| `attendance` | `studentId` ASC + `date` ASC |
| `auditLogs` | `schoolId` ASC + `timestamp` DESC |
| `auditLogs` | `schoolId` ASC + `action` ASC + `timestamp` DESC |
| `auditLogs` | `performedBy` ASC + `timestamp` DESC |
| `webhookFailures` | `status` ASC + `createdAt` DESC |
| `webhookFailures` | `schoolId` ASC + `status` ASC + `createdAt` DESC |

## Subscription State Machine

`subscriptionStatus` follows this lifecycle on the school document:

```
trial â”€â”€â–º active â”€â”€â–º past_due â”€â”€â–º expired
```

| Status | Meaning |
|--------|---------|
| `trial` | Initial state set when school is created |
| `active` | Payment captured â€” subscription is live |
| `past_due` | Period ended without renewal (set externally / cron) |
| `expired` | Grace period elapsed (set externally / cron) |

### School document subscription fields

```json
{
  "subscriptionPlan": "Premium",
  "subscriptionStatus": "active",
  "currentPeriodStart": "<Firestore Timestamp>",
  "currentPeriodEnd": "<Firestore Timestamp>",
  "subscriptionUpdatedAt": "<Firestore Timestamp>"
}
```

### Plan durations (defaults)

| Plan | Duration |
|------|---------|
| `Trial` | 14 days |
| `Basic` | 30 days |
| `Standard` | 30 days |
| `Premium` | 30 days |
| `Annual` | 365 days |

Override by passing `durationDays` in the `POST /payments/create-order` body.

On `payment.captured` webhook, `currentPeriodStart` is set to the capture time and `currentPeriodEnd` is computed as `captureTime + durationDays`. Both timestamps are stored on the school document and the invoice.

## Security Features

- **Multi-tenant isolation** â€” `schoolId` is always derived from the authenticated user's Firestore document, never from client input
- **Role-based access control** â€” route-level role checks via `roleMiddleware`
- **Subscription enforcement** â€” student creation blocked when plan limit reached
- **Rate limiting** â€” 100 requests/minute per IP
- **Webhook signature verification** â€” HMAC-SHA256 for Razorpay webhooks
- **Attendance cross-tenant validation** â€” verifies student belongs to the same school before marking attendance
- **Duplicate attendance prevention** â€” same `studentId` + `date` combination cannot be recorded twice
- **Soft deletes** â€” students and teachers are never hard-deleted; `isDeleted: true` hides them from all reads and blocks attendance marking
- **Audit logging** â€” every mutating action writes a tamper-evident `auditLogs` entry (fire-and-forget; never blocks the main flow)
- **Webhook failure safety** â€” handler errors are persisted to `webhookFailures` with full payload; `POST /webhooks/retry/:failureId` re-processes any failure on demand
- **Storage isolation** â€” all file uploads are scoped to `schools/{schoolId}/{category}/{file}`; cross-tenant writes are rejected at the path-builder level

## Background Job Safety

When a webhook handler throws mid-processing, the failure is **persisted** to Firestore instead of being silently dropped. This decouples Razorpay's delivery guarantee from our processing guarantee.

### Failure lifecycle

```
Razorpay delivers event
        â”‚
        â–¼
  signature verified
        â”‚
        â–¼
  handlePaymentCaptured throws
        â”‚
        â–¼
  logWebhookFailure()â”€â”€â–º webhookFailures/{id}  status: "failed"
        â”‚
        â–¼
  reply 200 â”€â”€â”€â–º Razorpay stops retrying (we own the retry cycle)
        â”‚
        â–¼
  POST /webhooks/retry/:failureId  (SuperAdmin)
        â”‚
   â”Œâ”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ success               â”‚ failure
   â–¼                       â–¼
 status: "resolved"    retryCount++, status: "failed"
```

### `webhookFailures` document fields

| Field | Description |
|-------|-------------|
| `eventType` | Razorpay event string, e.g. `payment.captured` |
| `razorpayEventId` | `payment.entity.id` if extractable from the payload |
| `schoolId` | Tenant ID from payment notes, if extractable |
| `rawPayload` | Full JSON string of the original event body |
| `errorMessage` | Exception message from the failed handler |
| `errorStack` | Stack trace (nullable) |
| `retryCount` | Number of retry attempts after the initial failure |
| `status` | `failed` \| `retrying` \| `resolved` |
| `createdAt` | When the failure was first logged |
| `lastRetriedAt` | Timestamp of most recent retry attempt |
| `resolvedAt` | Timestamp when status transitioned to `resolved` |

### Retry curl example

```bash
curl -X POST http://localhost:5000/webhooks/retry/FAILURE_DOC_ID \
  -H "Authorization: Bearer SUPERADMIN_TOKEN"
```

Response on success:
```json
{ "success": true, "message": "Webhook failure re-processed successfully" }
```

Response if already resolved:
```json
{ "success": true, "message": "Failure already resolved â€” no action taken" }
```

### Future: automatic retry via Cloud Scheduler

When Cloud Scheduler or a cron job is available, query pending failures and auto-retry:

```
GET webhookFailures WHERE status == "failed" AND retryCount < 3 ORDER BY createdAt ASC
```

Call `POST /webhooks/retry/:failureId` for each. After 3 failed retries, escalate to alerting (e.g. PagerDuty, Slack) and leave for manual intervention.

## Storage Isolation

All Firebase Storage writes **must** go through `src/lib/storage.ts`. Files are always stored under:

```
schools/{schoolId}/{category}/{fileName}
```

Direct path construction in route handlers is prohibited â€” the helpers are the single source of truth.

### Storage categories

| Category | Path segment | Intended use |
|----------|-------------|---------------|
| `ASSIGNMENTS` | `assignments/` | Assignment uploads by students |
| `RESULTS` | `results/` | Exam result sheets |
| `PROFILE_PHOTOS` | `profile-photos/` | Student / teacher profile images |
| `DOCUMENTS` | `documents/` | General school documents |

### Usage when file routes are added

```typescript
import { uploadFile, StorageCategory } from "../lib/storage";

// Inside a route handler â€” schoolId always comes from request.schoolId (never client input)
const result = await uploadFile({
  schoolId: request.schoolId,
  category: StorageCategory.ASSIGNMENTS,
  fileName: "homework-01.pdf",
  fileBuffer: buffer,
  contentType: "application/pdf",
});
// result.storagePath â†’ "schools/school_abc/assignments/homework-01.pdf"
// result.downloadUrl â†’ signed URL valid for 7 days
```

### Path builder

```typescript
import { getStoragePath, StorageCategory } from "../lib/storage";

getStoragePath("school_abc", StorageCategory.ASSIGNMENTS, "hw.pdf");
// â†’ "schools/school_abc/assignments/hw.pdf"
```

### deleteFile cross-tenant guard

`deleteFile(schoolId, storagePath)` validates that `storagePath` starts with `schools/{schoolId}/` before issuing a delete. A path belonging to a different school throws immediately.

### Adding a new category

Add an entry to the `StorageCategory` const object in `src/lib/storage.ts`. Never introduce a new path segment anywhere else.

## Soft Deletes

Students and teachers are **never hard-deleted**. A `DELETE` request sets `isDeleted: true` on the document and records who deleted it and when.

### Soft-deleted document fields

| Field | Type | Set when |
|-------|------|----------|
| `isDeleted` | `boolean` | Always present; `false` on create |
| `deletedAt` | `Firestore Timestamp` | Set on deletion |
| `deletedBy` | `string` (UID) | Set on deletion |

### Behaviour

- `GET /students` and `GET /students/:id` â€” soft-deleted students are excluded from all responses
- `DELETE /students/:id` â€” idempotent on "already deleted" (returns 404, not an error)
- Marking attendance for a soft-deleted student returns `404 Student not found`
- The raw Firestore documents remain intact, queryable for compliance audits
- Every soft-delete writes a `DELETE_STUDENT` or `DELETE_TEACHER` audit log entry

### Curl example

```bash
curl -X DELETE http://localhost:5000/students/STUDENT_ID \
  -H "Authorization: Bearer TOKEN"
```

Expected: `{ "success": true, "message": "Student deleted" }`

## Audit Logs

Every state-changing operation writes a document to the `auditLogs` Firestore collection.

### Document shape

```json
{
  "id": "<auto-generated>",
  "action": "CREATE_STUDENT",
  "performedBy": "<firebase-uid | system>",
  "schoolId": "<tenant-id>",
  "timestamp": "<Firestore Timestamp>",
  "metadata": {}
}
```

### Action catalogue

| Action | Triggered by | `performedBy` |
|--------|-------------|---------------|
| `CREATE_STUDENT` | `POST /students` | Authenticated user UID |
| `CREATE_TEACHER` | `POST /teachers` | Authenticated user UID |
| `MARK_ATTENDANCE` | `POST /attendance` | Authenticated user UID |
| `DELETE_STUDENT` | `DELETE /students/:id` | Authenticated user UID |
| `DELETE_TEACHER` | `DELETE /teachers/:id` | Authenticated user UID |
| `WEBHOOK_RETRY` | `POST /webhooks/retry/:failureId` | Authenticated user UID |
| `PAYMENT_RECEIVED` | Razorpay `payment.captured` webhook | `"system"` |
| `SUBSCRIPTION_UPGRADED` | Razorpay `payment.captured` webhook | `"system"` |

### Metadata examples

**CREATE_STUDENT**
```json
{ "studentId": "...", "firstName": "...", "lastName": "...", "classId": "...", "sectionId": "..." }
```

**MARK_ATTENDANCE**
```json
{ "attendanceId": "...", "studentId": "...", "date": "2026-02-21", "status": "Present", "classId": "...", "sectionId": "..." }
```

**PAYMENT_RECEIVED**
```json
{ "invoiceId": "...", "razorpayPaymentId": "...", "amount": 50000, "currency": "INR", "plan": "Premium" }
```

**SUBSCRIPTION_UPGRADED**
```json
{ "plan": "Premium", "subscriptionStatus": "active", "currentPeriodStart": 1234567890000, "currentPeriodEnd": 1237159890000, "durationDays": 30 }
```

### Important implementation notes

- `writeAuditLog` is **fire-and-forget** â€” failures are caught and logged to the server console, but never propagated to the caller. This ensures audit errors never degrade service availability.
- `performedBy` is always set from the verified `request.user.uid` for HTTP routes, never from client-supplied input.
- For webhook-triggered events, `performedBy` is set to `"system"` since there is no authenticated user.

## Testing

### Health Check

```bash
curl http://localhost:5000/health
```

Expected: `{ "success": true, "message": "Backend running" }`

### Auth Guard (no token)

```bash
curl http://localhost:5000/debug
```

Expected: `401`

### Debug (with token)

```bash
curl http://localhost:5000/debug -H "Authorization: Bearer TOKEN"
```

Expected: `{ "user": {...}, "schoolId": "..." }`

### Create Student

```bash
curl -X POST http://localhost:5000/students \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "classId": "class-1",
    "sectionId": "A",
    "rollNumber": "1",
    "parentPhone": "9999999999",
    "gender": "Male"
  }'
```

### Create Teacher

```bash
curl -X POST http://localhost:5000/teachers \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@school.com",
    "department": "Math",
    "subjects": ["Algebra", "Geometry"],
    "isActive": true
  }'
```

### Mark Attendance

```bash
curl -X POST http://localhost:5000/attendance \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STUDENT_ID",
    "date": "2026-02-21",
    "status": "Present",
    "classId": "class-1",
    "sectionId": "A"
  }'
```

### Get Attendance

```bash
curl "http://localhost:5000/attendance?date=2026-02-21" \
  -H "Authorization: Bearer TOKEN"
```

### Create Payment Order

```bash
curl -X POST http://localhost:5000/payments/create-order \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "plan": "Premium",
    "durationDays": 30
  }'
```

## Error Response Format

All errors follow a consistent structure:

```json
{
  "success": false,
  "message": "Error description"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Validation failed |
| 401 | Missing or invalid token / user not found |
| 403 | Insufficient role / no school / subscription limit reached / cross-tenant |
| 404 | Resource not found |
| 409 | Duplicate attendance record |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

