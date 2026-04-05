# Prometheus Alerts Quickstart

Use this quickstart to activate alerting for login and dashboard critical paths.

## 1) Load alert rules

Add the group file into your Prometheus config:

- Source file: `docs/observability/prometheus-alert-rules.yml`

Example Prometheus snippet:

```yaml
rule_files:
  - "docs/observability/prometheus-alert-rules.yml"
```

Reload Prometheus after updating config.

## 2) Verify rule registration

Check Prometheus UI:

- Status -> Rules
- Confirm group `SuffaCampus-critical-endpoints` is present

## 3) Validate metrics are scraped

Run queries in Prometheus expression browser:

- `sum(rate(SuffaCampus_critical_request_duration_seconds_count[5m]))`
- `sum(rate(SuffaCampus_auth_lookup_cache_events_total[5m]))`
- `sum(rate(SuffaCampus_dashboard_query_duration_seconds_count[5m]))`
- `sum(rate(SuffaCampus_overload_shed_requests_total[5m]))`

If queries are empty, verify:

- `/metrics` endpoint is reachable from Prometheus
- `METRICS_AUTH_TOKEN` is configured in scrape authorization when needed

## 4) Simulate load and confirm alert behavior

Run focused profile:

```bash
npm run load:auth-dashboard
```

Optional with env vars:

```bash
BASE_URL=http://localhost:5000 \
SCHOOL_CODE=DEMO01 \
USERNAME=teacher_demo \
AUTH_TOKEN=<firebase-id-token> \
SCHOOL_ID=<school-id> \
npm run load:auth-dashboard
```

Windows PowerShell helper:

```powershell
./k6/run-auth-dashboard-load.ps1 -BaseUrl http://localhost:5000 -SchoolCode DEMO01 -Username teacher_demo -AuthToken <token> -SchoolId <school-id>
```

Expected:

- p95/p99 alerts remain inactive under normal limits
- overload alert only activates if lanes are saturated and shedding persists

## 5) Suggested alert routing

- Warning severity -> team Slack channel
- Critical severity -> on-call pager

Critical alerts from this ruleset:

- `SuffaCampusCriticalEndpointP99High`
- `SuffaCampusOverloadSheddingDetected`

