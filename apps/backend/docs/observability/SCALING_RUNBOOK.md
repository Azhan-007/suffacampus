# Scaling Runbook (Auth + Dashboard)

This runbook covers the critical login and dashboard paths that are most sensitive during school start time peaks.

## 1) Prerequisites

- Apply latest Prisma migrations so `User(username, isActive)` index exists.
- Deploy backend with new metrics and overload guardrails enabled.
- Ensure Prometheus scrapes `GET /metrics`.

## 2) Overload Guardrail Configuration

These environment variables cap concurrent in-flight requests by lane:

- `CRITICAL_AUTH_LOOKUP_CONCURRENCY` (default `150`)
- `CRITICAL_AUTH_LOGIN_CONCURRENCY` (default `120`)
- `CRITICAL_DASHBOARD_CONCURRENCY` (default `220`)

When limits are hit, API returns:

- HTTP `503`
- error code: `OVERLOADED_RETRY_LATER`
- `Retry-After: 1`

## 3) Alerts

Import [docs/observability/prometheus-alert-rules.yml](docs/observability/prometheus-alert-rules.yml) into your Prometheus alerting stack.

Key alert families:

- p95 and p99 latency for critical endpoints
- auth lookup cache miss ratio spike
- dashboard query p95 latency
- overload shedding detected

## 4) Load Test Profile

Use the focused profile:

```bash
k6 run k6/login-dashboard.js
```

Common staging run:

```bash
BASE_URL=http://localhost:5000 \
SCHOOL_CODE=DEMO01 \
USERNAME=teacher_demo \
AUTH_TOKEN=<firebase-id-token> \
SCHOOL_ID=<school-id> \
k6 run k6/login-dashboard.js
```

Profile behavior:

- Scenario A: high-rate public auth lookups (`/auth/user-by-username`, `/auth/schools`)
- Scenario B: authenticated login + dashboard mix (`/auth/login`, `/dashboard/stats`)

## 5) Observe During Test

Monitor these backend metrics in real-time:

- `SuffaCampus_critical_request_duration_seconds`
- `SuffaCampus_critical_slow_requests_total`
- `SuffaCampus_auth_lookup_cache_events_total`
- `SuffaCampus_dashboard_query_duration_seconds`
- `SuffaCampus_overload_shed_requests_total`

## 6) Success Criteria

- p95 auth lookup latency < 350ms
- p95 auth login latency < 500ms
- p95 dashboard latency < 600ms
- overload shed rate near zero under expected peak
- error rate < 5%

## 7) Tuning Guidance

- If p95 grows and shed count is zero: increase DB/cache capacity first.
- If shed count rises and p95 stays stable: raise lane limits gradually (10-15%) and retest.
- If both p95 and shed count rise: scale out backend replicas and review DB saturation.

