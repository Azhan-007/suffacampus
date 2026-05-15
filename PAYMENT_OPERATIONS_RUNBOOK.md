# Payment Operations Runbook — SuffaCampus Module 4

> **Scope**: Fees & Payments. Razorpay + Stripe (legacy). PostgreSQL via Prisma. BullMQ on Redis.  
> **Last updated**: 2026-05-14

---

## 1. Payment Processing Lifecycle

```
Client → POST /api/v1/payments/create-order
       → createOrder() → Razorpay orders.create → LegacyPayment{status:pending}
       
Client pays in Razorpay Checkout
       
Razorpay → POST /webhooks/razorpay  [payment.captured]
         → verifyWebhookSignature (HMAC-SHA256)
         → persistWebhookEvent (idempotent)
         → enqueueWebhookEventProcessing (BullMQ)
         
Worker → processWebhookEventById
       → processProviderPayment (DB transaction + FOR UPDATE lock)
       → activatePaid (tenant activation)
       → createImmutableInvoice (atomic sequence number)
       → LegacyPayment{status:completed, activationState:activated}
```

**Alternative paths:**
- `POST /api/v1/payments/verify` — client-side verify after checkout (calls processProviderPayment with source=verify)
- No Redis → webhook processed inline in the HTTP handler (no retries)

---

## 2. Reconciliation Lifecycle

Detection runs every:
- **10 min**: captured-not-activated payments
- **30 min**: stale pending payments + stale PROCESSING webhooks
- **4 AM daily**: full run (all detection types + repair sweep)

Repair sweep runs every 15 minutes on open drift records.

**Drift types and auto-repair:**

| Drift Type | Auto-repair | Max Attempts |
|---|---|---|
| `activation_drift` | ✅ re-processes payment via reconcile path | 5 |
| `orphaned_capture` | ✅ same as activation_drift | 5 |
| `reconciliation_required` | ✅ same as activation_drift | 5 |
| `stale_pending` | ✅ checks Razorpay → mark failed or re-process | 5 |
| `orphaned_invoice` | ❌ requires manual review | – |
| `invoice_payment_mismatch` | ❌ requires manual review | – |
| `refund_drift` | ❌ requires manual review | – |
| `provider_missing` | ❌ requires manual review | – |
| `stale_overdue` | ❌ requires manual review | – |

After 5 repair attempts → `status: manual_review_required` → review via ops endpoint.

---

## 3. Queue Behavior & Fallbacks

### BullMQ Queues (require Redis)

| Queue | Job | Concurrency | Attempts | Backoff |
|---|---|---|---|---|
| `webhook-event-jobs` | Process webhook event | 5 | 5 | Exponential 1s |
| `payment-recovery-jobs` | Recover stuck payment | 3 | 5 | Exponential 1s |
| `reconciliation-jobs` | Full reconciliation run | 1 | 3 | Exponential 5s |

### No-Redis Fallback
All queues fall back to `setImmediate()` inline execution. **No retries, no dead-letter escalation.**  
Production deployments MUST have Redis.

### Dead-letter handling
- Webhook jobs exhausted → `WebhookEvent.status = DEAD_LETTER` + in-app ALERT notification
- Payment recovery exhausted → `LegacyPayment.activationState = reconciliation_required` + ALERT notification
- Both tracked by ops endpoints

---

## 4. Webhook Flow

```
POST /webhooks/razorpay
  1. Verify x-razorpay-signature (HMAC-SHA256, RAZORPAY_WEBHOOK_SECRET)
  2. Check created_at within 5-min window (replay protection)
  3. persistWebhookEvent (idempotent by eventId or payload hash)
  4. If duplicate + status FAILED/VERIFIED → re-enqueue for retry
  5. Enqueue to webhook-event-jobs
  6. Return 200 immediately

POST /webhooks/stripe
  Same pattern — verified by STRIPE_WEBHOOK_SECRET (timestamp + v1 signature)
```

**Supported Razorpay events:**
- `payment.captured` → triggers full activation flow
- `payment.failed` → increments school.paymentFailureCount + audit log
- `refund.created` → creates credit note + updates payment status

---

## 5. Drift Repair Strategy

1. Drift detected → `ReconciliationDriftRecord{status:detected}` created
2. Repair sweep checks drift type → calls appropriate repair function
3. Repair calls `processProviderPayment(source:"reconcile")` → re-uses same activation path
4. On success → `status:repaired`
5. On failure (up to 5x) → `status:manual_review_required`
6. Emit `ReconciliationAuditEvent` for each attempt/outcome (immutable audit trail)

---

## 6. Operational Recovery Expectations

### Stuck payment (activation_drift)
**Symptom**: School paid, webhook delivered, but subscription not active  
**Auto-recovery**: Repair sweep picks it up within 15 min  
**Manual**: `GET /api/v1/ops/payment-health` → check stuckPayments count  
**Action**: Drift record will auto-repair up to 5x. If still stuck → check `activationLastError`

### Dead-letter webhook
**Symptom**: Webhook DEAD_LETTER, school admin received ALERT notification  
**Manual**: `GET /api/v1/ops/reconciliation` → find drift records  
**Action**: If payment was captured at Razorpay → payment-recovery queue will attempt activation. Check `PaymentActivationLedger` for error details.

### Stale PROCESSING webhook
**Symptom**: Worker crashed mid-job, webhook stuck in PROCESSING  
**Auto-recovery**: 30-min cron resets it to FAILED → BullMQ retry picks it up  
**Manual**: `GET /api/v1/ops/queue-health` → check staleProcessingWebhooks

### Redis unavailable
**Symptom**: All queues running inline, no retry capability  
**Impact**: Payment webhooks processed inline (fragile), no dead-letter detection  
**Action**: Restore Redis. Check `REDIS_URL` is set and reachable. Startup logs will warn.

---

## 7. Startup Checklist

All validated at startup — server exits with clear error if any FATAL item is missing:

| Variable | Required? | Effect if missing |
|---|---|---|
| `DATABASE_URL` | FATAL | Server exits |
| `FIREBASE_PROJECT_ID/EMAIL/KEY` | FATAL | Server exits |
| `JWT_ACCESS_SECRET` | FATAL in production | Server exits |
| `RAZORPAY_WEBHOOK_SECRET` | FATAL if RAZORPAY_KEY_ID is set | Server exits |
| `REDIS_URL` | WARN | Queues run inline (no retries) |
| `RAZORPAY_KEY_ID/SECRET` | WARN | Payment features unavailable |
| `SENTRY_DSN` | WARN | Error tracking disabled |
| `METRICS_AUTH_TOKEN` | WARN | /metrics returns 503 |

---

## 8. Ops Endpoints

All require `X-API-Key` header matching one of the comma-separated values in `API_KEYS` env.

```
GET /api/v1/ops/payment-health
  Returns: status (healthy/degraded/critical), stuck payment counts,
           drift counts by type, dead-letter webhook counts

GET /api/v1/ops/reconciliation
  Returns: open drift records (50), manual_review_required records (20),
           recent reconciliation audit events (20)

GET /api/v1/ops/queue-health
  Returns: webhook event counts by status, payment recovery backlog,
           stale PROCESSING webhooks, Redis configured flag
```

**Health thresholds:**
- `healthy`: 0 stuck payments, 0 dead-letter webhooks, 0 stale processing, 0 manual review drifts
- `degraded`: <5 stuck payments AND <10 dead-letter webhooks
- `critical`: above either threshold

---

## 9. Invoice Sequence

Invoice numbers follow: `INV-{SCHOOL_CODE}-{YYYYMM}-{NNN}`  
Sequence is allocated atomically via PostgreSQL `ON CONFLICT ... DO UPDATE` in `InvoiceSequence` table.  
Sequence is per-school per-period-key (YYYYMM).  
Safe for concurrent activation — no gaps, no duplicates under normal conditions.

**Anomaly signal**: If `sequenceNumber` is non-sequential for a school/period, it indicates:
1. Failed invoice creation retried (sequence consumed but invoice not created) — harmless gap
2. Manual DB intervention — investigate if unexpected

---

## 10. Worker Schedule Summary

| Schedule | Job | Purpose |
|---|---|---|
| `0 * * * *` | Trial Expiry | Expire trials |
| `15 * * * *` | Overdue Subscriptions | Move to past_due |
| `30 * * * *` | Grace Expiry | Expire past_due |
| `*/5 * * * *` | Payment Recovery Sweep | Re-enqueue stuck payments |
| `*/10 * * * *` | Captured-Not-Activated Detection | Detect stale captures |
| `*/15 * * * *` | Repair Sweep | Attempt drift repairs |
| `*/30 * * * *` | Stale Pending + Stale Webhooks | Detect + reset stuck jobs |
| `0 2 * * *` | Usage Snapshot | Daily usage capture |
| `30 2 * * *` | Usage Counter Reconcile | Detect counter drift |
| `0 3 * * *` | Webhook Cleanup | Delete old PROCESSED events |
| `30 3 * * *` | Data Retention | Prune audit logs, error logs, etc |
| `0 4 * * *` | Full Reconciliation | All detection + repair |
| `0 8 * * *` | Overdue Fee Notifications | Daily overdue alerts |
| `0 9 * * *` | Trial Expiry Reminders | Email reminders at 7d/2d |
| `0 10 * * *` | Usage Limit Warnings | Warn schools at 80% usage |
| `*/1 * * * *` | Report Processing | Process pending reports |

---

## 11. Infra Assumptions

- **Single-instance deployment** — all cron jobs and queue workers run in the same Node.js process
- **PostgreSQL** — Prisma transactions with `FOR UPDATE` row locking prevent concurrent activation of the same payment
- **Redis** — Required for reliable queue processing. Absence = graceful degraded mode (inline only)
- **Razorpay** — Primary payment provider. Stripe integration is legacy/secondary
- **Node.js 22+** — Unhandled rejections do not crash the process (logged + tracked but not fatal)

---

*End of runbook.*
