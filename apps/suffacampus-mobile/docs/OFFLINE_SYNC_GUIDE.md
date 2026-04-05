# Offline Sync & Mutation Queue Guide

## Overview

The SuffaCampus mobile app automatically queues failed API requests and retries them with exponential backoff when the network becomes available. This enables users to interact with the app even during network outages, with mutations replayed seamlessly when connectivity is restored.

**Supported Operations:**
- âœ… Attendance marking (mark present/absent for students)
- âœ… Assignment submissions (submit coursework)
- âœ… Fee/payment operations (record payments, create payment orders)
- âœ… Admin fee management (record manual payments, create fee templates)

---

## Architecture

### Queue Storage

Mutations are persisted to **AsyncStorage** (React Native) with the key:
```
SuffaCampus.offlineMutationQueue.v1
```

Each queued mutation has:
```typescript
{
  id: string;              // Unique ID: timestamp_randomSuffix
  path: string;            // API endpoint: /attendance, /submissions, /payments, etc.
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;          // Request payload
  createdAt: string;       // ISO timestamp when queued
  attempts: number;        // Retry count (starts at 0)
  nextRetryAt: number;     // Millisecond timestamp for next retry attempt
}
```

### Retry Strategy

**Exponential Backoff with Cap:**
- Delay = `2^attempts * 1000ms`, capped at 120 seconds (2 minutes)
- Max attempts: 5
- Transient network errors: retry (network error, timeout, failed-to-fetch)
- HTTP errors: no retry (4xx, 5xx)

**Example Retry Timeline:**
```
Attempt 0 â†’ Queue immediately
â†“
Attempt 1 â†’ Retry at now + 2^0 * 1000ms = 1 second
â†“
Attempt 2 â†’ Retry at now + 2^1 * 1000ms = 2 seconds
â†“
Attempt 3 â†’ Retry at now + 2^2 * 1000ms = 4 seconds
â†“
Attempt 4 â†’ Retry at now + 2^3 * 1000ms = 8 seconds
â†“
Attempt 5 â†’ Retry at now + 2^4 * 1000ms = 16 seconds
â†“
Attempt 6+ â†’ Cap at 120 seconds; manual intervention required
```

---

## Auto-Flush Triggers

Queued mutations are automatically flushed (retried) in three scenarios:

### 1. App Foreground Transition

**Trigger:** User resumes the app from background

**Mechanism:** `AppState` listener in [_layout.tsx](./_layout.tsx)

**Why:** Ensures queued work is retried immediately when the user returns to the app.

```typescript
AppState.addEventListener('change', (nextAppState) => {
  if (appState.match(/inactive|background/) && nextAppState === 'active') {
    // App resumed â†’ flush queue
    await flushOfflineQueue();
  }
});
```

### 2. Successful Login

**Trigger:** User successfully authenticates

**Mechanism:** `submitAssignment` adds flush call after profile fetch in [login.tsx](../app/login.tsx)

**Why:** Mutations queued during offline/logged-out state are retried immediately after login succeeds.

```typescript
// After Firebase login + profile fetch
await flushOfflineQueue();
```

### 3. Periodic Timer (30-Second Interval)

**Trigger:** Every 30 seconds while app is running

**Mechanism:** `setInterval` in [_layout.tsx](./_layout.tsx)

**Why:** Continuous opportunity to retry queued mutations, especially those in early retry backoff phases.

```typescript
setInterval(() => {
  flushOfflineQueue();
}, 30_000); // 30 seconds
```

---

## Supported Endpoints

### Attendance Service

| Endpoint | Method | Queueable |
|----------|--------|-----------|
| `/attendance` | POST | âœ… Yes |
| `/attendance/bulk` | POST | âœ… Yes |

**Failure Path:** [attendanceService.ts](./attendanceService.ts)
```typescript
try {
  await markAttendance(payload);
} catch (error) {
  // Automatically queued for retry
  throw error;
}
```

### Assignment Service

| Endpoint | Method | Queueable |
|----------|--------|-----------|
| `/submissions` | POST | âœ… Yes |

**Failure Path:** [assignmentService.ts](./assignmentService.ts)
```typescript
try {
  await submitAssignment(payload);
} catch (error) {
  // Automatically queued for retry
  throw error;
}
```

### Fee Service (Student Payments)

| Endpoint | Method | Queueable |
|----------|--------|-----------|
| `/payments/create-order` | POST | âœ… Yes |
| `/payments` | POST | âœ… Yes |

**Failure Paths:** [feesService.ts](./feesService.ts)
```typescript
// Payment order creation
try {
  await createPaymentOrder(payload);
} catch (error) {
  // Queued for retry; rethrows
  throw error;
}

// Payment recording
try {
  await recordPayment(payload);
} catch (error) {
  // Queued for retry; rethrows
  throw error;
}
```

### Admin Fee Service

| Endpoint | Method | Queueable |
|----------|--------|-----------|
| `/fees` | POST | âœ… Yes |
| `/admin/fee-templates` | POST | âœ… Yes |

**Failure Paths:** [adminFeeService.ts](./adminFeeService.ts)
```typescript
// Manual fee payment recording
try {
  await recordAdminFeePayment(data);
} catch (error) {
  // Queued for retry; rethrows
  throw error;
}

// Fee template creation
try {
  await createFeeTemplate(data);
} catch (error) {
  // Queued for retry; rethrows
  throw error;
}
```

---

## User Experience Flow

### Scenario: Student Submits Assignment Offline

```
1. Student opens assignment in app
2. User has no network (offline)
3. Student enters solution â†’ "Submit" button tapped
4. Request to POST /submissions fails (network error)
5. System enqueues mutation with exponential backoff
6. User sees: "Submitted (queued)" or similar indicator
7. User opens network connection
8. App auto-detects (foreground, periodic timer, or login)
9. Queued submission retried within 30 seconds
10. Backend receives submission with timestamp from offline attempt
11. User sees confirmation
```

### Scenario: Admin Marks Attendance Offline

```
1. Admin opens attendance roll call (no network)
2. Admin marks students present/absent
3. Admin taps "Save Attendance"
4. Request to POST /attendance/bulk fails
5. System queues mutation with 2-4 second retry backoff
6. Device reconnects to network
7. Periodic timer fires (30s interval)
8. Queued attendance batch retried
9. Backend records attendance with original timestamp
10. Confirm message appears in admin's feed
```

---

## Failure Handling & UX

### Immediate Failures (Queued)

When a mutation fails with a **transient network error**, the function:
1. Logs the error: `[ServiceName] Queued mutation for offline retry: <message>`
2. Enqueues to AsyncStorage
3. **Re-throws the error** (caller still sees failure, but it's queued)

**Reason:** Callers expect either success or error, not silent queueing. Re-throwing allows UI to show appropriate feedback (e.g., "Saved locally, will retry when online").

### Permanent Failures (Not Queued)

HTTP errors (4xx, 5xx) are **not retried** because they indicate:
- Invalid input (400)
- Unauthorized (401)
- Not found (404)
- Server error (5xx)

These typically require user intervention or can be treated as failed (not queued).

### Manual Retry

If a mutation exhausts retries (5 attempts over ~30 seconds), it remains queued for 72-hour expiry. Users can:
1. **Check connectivity:** Ensure device is online
2. **Restart app:** Triggers AppState listener â†’ queue flush
3. **Pull-to-refresh:** May trigger background sync in future versions

---

## Configuration

### Queue Limits

**Max items per flush:** Controlled per service
- Default: 20 items
- Attendance: 25 items
- All services combined: 50 items (via `flushQueuedAttendanceMutations`)

**Max storage:** AsyncStorage limit depends on platform (~5-10MB typical)

### Retry Backoff Formula

```typescript
retryDelayMs(attempts: number): number {
  const exponential = Math.pow(2, attempts) * 1000; // milliseconds
  const capped = Math.min(exponential, 120_000);   // 2 minutes max
  return capped;
}
```

### Auto-Flush Interval

- **AppState listener:** Immediate on background â†’ foreground
- **Periodic timer:** Every 30 seconds
- **Login flush:** Immediately after successful authentication

---

## Debugging & Monitoring

### View Queued Mutations

In React Native DevTools or console:
```javascript
// Access AsyncStorage directly (for debugging)
AsyncStorage.getItem('SuffaCampus.offlineMutationQueue.v1')
  .then(queue => console.log(JSON.parse(queue || '[]')))
```

### Log Messages

- `[AppState] App foreground: flushing offline queue`
- `[PeriodicFlush] Offline queue flush failed: <error>`
- `[AttendanceSync] Marked attendance for retry`
- `[AssignmentSubmit] Queued submission for offline retry`
- `[PaymentRecord] Queued payment record for offline retry`
- `[AdminFeePayment] Queued fee payment for offline retry`

### Monitor Flush Results

```javascript
const result = await flushOfflineQueue();
console.log(`Flushed: ${result.flushed}, Remaining: ${result.remaining}`);
```

---

## Best Practices

### For Feature Developers

1. **Wrap mutations in try/catch** in service functions:
   ```typescript
   try {
     return await apiFetch(...);
   } catch (error) {
     await enqueueOfflineMutation(...);
     throw error; // Caller handles UI feedback
   }
   ```

2. **Specify paths in flushQueuedAttendanceMutations**, if creating new endpoints:
   ```typescript
   await flushOfflineQueue({
     paths: ["/your/new/endpoint", "/another/endpoint"],
   });
   ```

3. **Test offline behavior:**
   - Disable network in DevTools
   - Perform mutations
   - Enable network
   - Verify mutations complete

### For UX/Product

1. **Educate users:** Show "Queued for retry" status when offline
2. **Provide retry button:** Allow manual retry instead of only periodic
3. **Expiry notification:** Alert users after 24 hours of failed retries
4. **Success confirmation:** Clearly indicate when queued mutation completes

---

## Flow Diagram

```
User Action (Attendance/Assignment/Fee)
         â†“
   [apiFetch call]
         â†“
    Try Request
    /          \
Success       Network Fail
  â†“              â†“
Return         enqueueOfflineMutation
Result         + re-throw error
                 â†“
              Show "Queued"
              UI Feedback
                 â†“
         Three Auto-Flush Triggers:
         1. App Foreground
         2. Login Success
         3. Periodic Timer (30s)
                 â†“
         [flushOfflineQueue]
              runs retries
         /      |       \
        /       |        \
    Success  Retry       Fail
      â†“       Backoff     â†“
   Update      â†“       Queue
   Backend   Wait       Again
      â†“       2^n      (+1 attempt)
   Clear     seconds
   Queue
```

---

## Testing

### Manual Test: Offline Attendance

1. Open app (enrolled as admin)
2. Go to attendance screen
3. Disable WiFi/cellular in device settings
4. Mark 3â€“5 students as present/absent
5. Tap "Save Attendance"
6. Observe error message + toast confirming "queued for retry"
7. Re-enable network
8. Within 30 seconds, observe flush + success confirmation
9. Verify attendance records in backend

### Automated Test

```typescript
describe("Offline Queue", () => {
  it("should queue failed attendance and retry", async () => {
    // Disable network mock
    mockNetworkError();
    
    // Attempt mutation
    await expect(markAttendance(payload))
      .rejects.toThrow("Network error");
    
    // Verify queued
    const queue = await AsyncStorage.getItem(..,);
    expect(JSON.parse(queue).length).toBe(1);
    
    // Re-enable network
    mockNetworkSuccess();
    
    // Flush queue
    const result = await flushOfflineQueue();
    expect(result.flushed).toBe(1);
    
    // Verify sent
    expect(mockApi.post).toHaveBeenCalledWith("/attendance", payload);
  });
});
```

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Mutations not retrying | App killed or no flush trigger | Restart app or enable network |
| Queue grows indefinitely | Persistent network failure or server error | Check connectivity + server logs |
| Old mutations in queue | Queued items not completing after days | Clear app cache or implement 72h expiry |
| Duplicate submissions | Retry sent before first succeeded | Add idempotency key to mutations |

---

## Future Enhancements

1. **Idempotency Keys:** Add `clientId` + `requestId` to prevent duplicate submissions
2. **Manual Retry Button:** UI for users to manually retry queued mutations
3. **Background Sync:** React Native background task to resume queue when app backgrounded
4. **Mutation Expiry:** Auto-delete queued items after 72 hours
5. **Analytics:** Track queue sizes, retry rates, success/failure metrics
6. **Selective Queue:** Different retry strategies for different mutation types (e.g., payment vs. attendance)

---

## Related Files

- [offlineSyncQueue.ts](./offlineSyncQueue.ts) â€” Core queue implementation
- [attendanceService.ts](./attendanceService.ts) â€” Attendance + queue integration
- [assignmentService.ts](./assignmentService.ts) â€” Assignment + queue integration
- [feesService.ts](./feesService.ts) â€” Fee payment + queue integration
- [adminFeeService.ts](./adminFeeService.ts) â€” Admin fee + queue integration
- [../app/_layout.tsx](../app/_layout.tsx) â€” AppState listener + periodic timer
- [../app/login.tsx](../app/login.tsx) â€” Login-triggered flush

