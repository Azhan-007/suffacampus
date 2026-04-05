# Health Readiness Endpoint Deployment Guide

## Overview

The `/health/ready` endpoint provides Kubernetes-style readiness probes with detailed visibility into all service dependencies (required and optional). This guide documents the endpoint behavior across different deployment configurations.

**Key Endpoints:**
- `GET /health` â€” Shallow liveness probe (always 200 if process alive)
- `GET /health/live` â€” Kubernetes liveness alias
- `GET /health/ready` â€” Deep readiness probe (checks all dependencies)
- `GET /health/cache` â€” Cache statistics for monitoring

---

## Response Structure

### Response Shape
```json
{
  "success": true,
  "status": "healthy|degraded|unhealthy",
  "version": "1.0.0",
  "commitSha": "abc123def456...",
  "environment": "production",
  "system": {
    "uptime": 3600,
    "memory": {
      "rss": 256,
      "heapUsed": 128,
      "heapTotal": 256,
      "external": 2
    },
    "pid": 12345,
    "nodeVersion": "v20.x.x"
  },
  "dependencies": {
    "firestore": {
      "status": "healthy|degraded|unhealthy",
      "latencyMs": 25,
      "error": null
    },
    "razorpay": {
      "status": "healthy|degraded|unhealthy",
      "error": null
    },
    "redis": {
      "status": "healthy|degraded|unhealthy",
      "error": "REDIS_URL not configured; realtime runs single-instance mode"
    },
    "search": {
      "backend": "elasticsearch|postgres",
      "status": "healthy|degraded|unhealthy",
      "error": null
    }
  },
  "timestamp": "2026-03-26T14:30:00.000Z"
}
```

### Status Codes
- **200 OK** â€” Status is `healthy` or `degraded` (pod can receive traffic)
- **503 Service Unavailable** â€” Status is `unhealthy` (critical dependency failed; pod should not receive traffic)

### Status Interpretation
| Status | Meaning | HTTP Code | Action |
|--------|---------|-----------|--------|
| `healthy` | All configured dependencies are operational | 200 | âœ… Pod ready |
| `degraded` | One or more optional dependencies unavailable, but service functional | 200 | âš ï¸ Pod ready, monitor logs |
| `unhealthy` | Required dependency failed; service cannot operate | 503 | âŒ Pod not ready; Kubernetes will evict |

---

## Deployment Modes

### Mode 1: Single-Instance Bare (Development / Small Deployments)

**Configuration:**
```bash
# Required
FIRESTORE_PROJECT_ID=SuffaCampus-prod
RAZORPAY_KEY_ID=key_xxx
RAZORPAY_KEY_SECRET=secret_xxx

# Optional (disabled)
# REDIS_URL not set
# ELASTICSEARCH_URL not set
```

**Response Example (Healthy):**
```json
{
  "success": true,
  "status": "degraded",
  "version": "1.0.0",
  "commitSha": "abc123...",
  "environment": "production",
  "system": {
    "uptime": 3600,
    "memory": { "rss": 256, "heapUsed": 128, "heapTotal": 256, "external": 2 },
    "pid": 12345,
    "nodeVersion": "v20.10.0"
  },
  "dependencies": {
    "firestore": {
      "status": "healthy",
      "latencyMs": 18
    },
    "razorpay": {
      "status": "healthy"
    },
    "redis": {
      "status": "degraded",
      "error": "REDIS_URL not configured; realtime runs single-instance mode"
    },
    "search": {
      "backend": "postgres",
      "status": "healthy"
    }
  },
  "timestamp": "2026-03-26T14:30:00.000Z"
}
```

**Behavior:**
- Realtime activity streaming works via in-memory client registry (single instance only)
- Search uses PostgreSQL contains-text (sufficient for most deployments)
- Overall status: `degraded` (optional Redis unavailable)
- HTTP 200 â€” pod ready for traffic

**Use Cases:** Single-server deployments, staging environments, small schools (~1k users)

---

### Mode 2: Redis Enabled (Horizontal Scaling Without Search)

**Configuration:**
```bash
# Required
FIRESTORE_PROJECT_ID=SuffaCampus-prod
RAZORPAY_KEY_ID=key_xxx
RAZORPAY_KEY_SECRET=secret_xxx

# Optional (enabled)
REDIS_URL=redis://redis-cluster:6379
# ELASTICSEARCH_URL not set
```

**Response Example (Healthy):**
```json
{
  "success": true,
  "status": "degraded",
  "version": "1.0.0",
  "commitSha": "abc123...",
  "environment": "production",
  "system": {
    "uptime": 3600,
    "memory": { "rss": 256, "heapUsed": 128, "heapTotal": 256, "external": 2 },
    "pid": 12345,
    "nodeVersion": "v20.10.0"
  },
  "dependencies": {
    "firestore": {
      "status": "healthy",
      "latencyMs": 22
    },
    "razorpay": {
      "status": "healthy"
    },
    "redis": {
      "status": "healthy"
    },
    "search": {
      "backend": "postgres",
      "status": "healthy"
    }
  },
  "timestamp": "2026-03-26T14:30:00.000Z"
}
```

**Behavior:**
- Realtime activity streaming fans out via Redis pub/sub across all instances
- Search uses PostgreSQL contains-text
- Echo prevention: INSTANCE_ID (PID + random suffix) prevents duplicate broadcasts
- Overall status: `healthy`
- HTTP 200 â€” pod ready for traffic

**Use Cases:** Multi-instance deployments, medium schools (5kâ€“50k users), high availability required

**Redis Health Check Details:**
The `redis` dependency in `/health/ready` checks:
1. Redis bridge enabled (REDIS_URL configured)
2. Publisher and subscriber clients connected and ready
3. Subscription to `activity:stream:v1` channel active

If Redis becomes unavailable, instances gracefully degrade:
- Realtime events broadcast to locally connected clients only
- Status transitions to `degraded` â†’ `unhealthy` after connection timeout (~30s)
- Other services (search, payments) unaffected

---

### Mode 3: Full Stack (Redis + Elasticsearch)

**Configuration:**
```bash
# Required
FIRESTORE_PROJECT_ID=SuffaCampus-prod
RAZORPAY_KEY_ID=key_xxx
RAZORPAY_KEY_SECRET=secret_xxx

# Optional (both enabled)
REDIS_URL=redis://redis-cluster:6379
ELASTICSEARCH_URL=https://elastic-cluster:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=password
```

**Response Example (Healthy):**
```json
{
  "success": true,
  "status": "healthy",
  "version": "1.0.0",
  "commitSha": "abc123...",
  "environment": "production",
  "system": {
    "uptime": 3600,
    "memory": { "rss": 256, "heapUsed": 128, "heapTotal": 256, "external": 2 },
    "pid": 12345,
    "nodeVersion": "v20.10.0"
  },
  "dependencies": {
    "firestore": {
      "status": "healthy",
      "latencyMs": 20
    },
    "razorpay": {
      "status": "healthy"
    },
    "redis": {
      "status": "healthy"
    },
    "search": {
      "backend": "elasticsearch",
      "status": "healthy"
    }
  },
  "timestamp": "2026-03-26T14:30:00.000Z"
}
```

**Search Elasticsearch Falls Back to Postgres (Degraded Example):**
```json
{
  "success": true,
  "status": "degraded",
  "version": "1.0.0",
  "commitSha": "abc123...",
  "environment": "production",
  "system": { /* ... */ },
  "dependencies": {
    "firestore": {
      "status": "healthy",
      "latencyMs": 20
    },
    "razorpay": {
      "status": "healthy"
    },
    "redis": {
      "status": "healthy"
    },
    "search": {
      "backend": "elasticsearch",
      "status": "unhealthy",
      "error": "connect ECONNREFUSED 10.0.0.5:9200"
    }
  },
  "timestamp": "2026-03-26T14:30:00.000Z"
}
```

**Behavior:**
- Realtime activity streaming via Redis pub/sub (horizontal fanout)
- Search attempts Elasticsearch first, falls back to PostgreSQL if unavailable
- Full-text search uses Elasticsearch multi_match with fuzziness when ES healthy
- PostgreSQL fallback ensures search always available (no 503 errors)
- Overall status: `healthy` (if all healthy) or `degraded` (if ES unavailable but other services ok)
- HTTP 200 â€” pod always ready

**Use Cases:** Large deployments (50kâ€“500k+ users), enterprise SaaS, high-performance search required

**Search Backend Health Check Details:**
- **Elasticsearch enabled**: Performs async ping to verify connectivity; returns `unhealthy` if timeout/error
- **Elasticsearch disabled**: Returns `degraded` (not unhealthy) because PostgreSQL fallback is available
- **Elasticsearch unavailable at runtime**: Logs warning, automatically uses PostgreSQL for that request; next `/health/ready` call shows `unhealthy` for search

---

## Failure Scenarios

### Scenario 1: Elasticsearch Down (Full Stack Mode)

**Request:**
```bash
curl http://localhost:3000/health/ready
```

**Response (Immediate):**
```json
{
  "success": true,
  "status": "degraded",
  "dependencies": {
    "search": {
      "backend": "elasticsearch",
      "status": "unhealthy",
      "error": "connect ECONNREFUSED 10.0.0.5:9200"
    },
    "firestore": { "status": "healthy", "latencyMs": 20 },
    "razorpay": { "status": "healthy" },
    "redis": { "status": "healthy" }
  }
}
```

**Behavior:**
- HTTP 200 (degraded, not unhealthy)
- Search requests automatically fall back to PostgreSQL
- No errors in application logs
- Status remains `degraded` until Elasticsearch recovers

**Recovery (Elasticsearch Restored):**
- Next `/health/ready` call pings Elasticsearch, sees it's back
- Status transitions to `healthy`

### Scenario 2: Redis Down (Redis Mode)

**Request:**
```bash
curl http://localhost:3000/health/ready
```

**Response:**
```json
{
  "success": false,
  "status": "unhealthy",
  "dependencies": {
    "redis": {
      "status": "unhealthy",
      "error": "Redis realtime bridge is not connected"
    },
    "firestore": { "status": "healthy", "latencyMs": 20 },
    "razorpay": { "status": "healthy" },
    "search": { "backend": "postgres", "status": "healthy" }
  }
}
```

**Behavior:**
- HTTP 503 (unhealthy â€” required for realtime scaling)
- Kubernetes readiness probe fails; pod marked not-ready
- Kubernetes may evict pod and spawn new instance with fresh Redis connection
- Existing clients continue receiving local realtime events (from their instance) but lose updates from other instances

**Recovery:**
- Redis reconnects automatically (with exponential backoff)
- Status transitions to `healthy`
- Pod becomes ready again

### Scenario 3: Firestore Down (Critical Dependency)

**Request:**
```bash
curl http://localhost:3000/health/ready
```

**Response:**
```json
{
  "success": false,
  "status": "unhealthy",
  "dependencies": {
    "firestore": {
      "status": "unhealthy",
      "latencyMs": 5000,
      "error": "Timeout: No response from Firestore"
    },
    "razorpay": { "status": "healthy" },
    "redis": { "status": "healthy" },
    "search": { "backend": "postgres", "status": "healthy" }
  }
}
```

**Behavior:**
- HTTP 503 (unhealthy)
- Kubernetes readiness probe fails; pod marked not-ready
- Queries fail at application layer (Prisma/Firestore errors)

---

## Kubernetes Integration

### Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: SuffaCampus-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: SuffaCampus-backend
  template:
    metadata:
      labels:
        app: SuffaCampus-backend
    spec:
      containers:
      - name: backend
        image: SuffaCampus-backend:latest
        ports:
        - containerPort: 3000
        env:
        # Required
        - name: FIRESTORE_PROJECT_ID
          valueFrom:
            configMapKeyRef:
              name: SuffaCampus-config
              key: firestore_project_id
        # Optional
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: SuffaCampus-secrets
              key: redis_url
        - name: ELASTICSEARCH_URL
          valueFrom:
            secretKeyRef:
              name: SuffaCampus-secrets
              key: elasticsearch_url
        
        # Readiness probe â€” deep dependency checks
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        
        # Liveness probe â€” shallow process check
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
```

**Probe Behavior:**
- **Readiness Probe** (`/health/ready`): Pod only receives traffic if status != `unhealthy`
  - Checks all dependencies (Firestore, Razorpay, Redis, Elasticsearch)
  - If `degraded`, pod may receive traffic but logs show warnings
  - If `unhealthy`, pod evicted from load balancer; Kubernetes may restart

- **Liveness Probe** (`/health/live`): Kubernetes will restart pod if unhealthy
  - Always returns 200 if event loop alive (doesn't check dependencies)
  - Restart only if process completely dead

### Service Mesh Integration (Istio Example)

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: SuffaCampus-backend
spec:
  hosts:
  - SuffaCampus-backend
  http:
  - route:
    - destination:
        host: SuffaCampus-backend
        port:
          number: 3000
    timeout: 30s
    retries:
      attempts: 3
      perTryTimeout: 10s
```

Monitor `/health/ready` to adjust traffic policies:
```bash
# Watch health status across all instances
while true; do
  for pod in $(kubectl get pods -l app=SuffaCampus-backend -o name); do
    status=$(kubectl exec ${pod} -- curl -s http://localhost:3000/health/ready | jq '.status')
    echo "${pod}: ${status}"
  done
  sleep 5
done
```

---

## Environment Variable Reference

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `FIRESTORE_PROJECT_ID` | Google Cloud Firestore project ID | `SuffaCampus-prod` |
| `RAZORPAY_KEY_ID` | Razorpay API key ID (for payment verification) | `key_xxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay API key secret | `secret_xxxx` |

### Optional (Realtime Scaling)
| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `REDIS_URL` | Redis connection URL; if unset, realtime runs in-memory (single-instance) | `redis://redis-cluster:6379` | None (disables Redis bridge) |

### Optional (Search Enhancement)
| Variable | Description | Example | Default |
|----------|----------|---------|---------|
| `ELASTICSEARCH_URL` | Elasticsearch cluster URL; if unset, uses PostgreSQL search | `https://elastic-cluster:9200` | None (uses PostgreSQL) |
| `ELASTICSEARCH_USERNAME` | Elasticsearch auth username | `elastic` | None (no auth) |
| `ELASTICSEARCH_PASSWORD` | Elasticsearch auth password | `password` | None |

### Build Info
| Variable | Description | Set By |
|----------|-------------|--------|
| `APP_VERSION` | Semantic version (defaults to 1.0.0) | Deploy pipeline |
| `COMMIT_SHA` | Git commit hash | Deploy pipeline |
| `NODE_ENV` | Environment name | Container / deployment |

---

## Monitoring & Alerting

### Prometheus Metrics (Optional Future Enhancement)

Export `/health/ready` metrics to Prometheus:
```bash
# Example scrape config
scrape_configs:
  - job_name: 'SuffaCampus-backend'
    metrics_path: '/health/ready'
    static_configs:
      - targets: ['localhost:3000']
```

**Alert Rules:**
```yaml
# Alert if any pod is unhealthy for > 1 minute
- alert: SuffaCampusBackendUnhealthy
  expr: health_ready_status{status="unhealthy"} > 0
  for: 1m
  annotations:
    summary: "SuffaCampus backend unhealthy"

# Alert if all pods degraded for > 5 minutes
- alert: SuffaCampusBackendDegraded
  expr: avg(health_ready_status{status="degraded"}) == 1
  for: 5m
  annotations:
    summary: "SuffaCampus backend operating in degraded mode"
```

### CloudWatch / Datadog Integration

Log `/health/ready` response in structured format:
```json
{
  "timestamp": "2026-03-26T14:30:00Z",
  "pod": "SuffaCampus-backend-abc123",
  "health": {
    "status": "healthy",
    "firestore": "healthy",
    "redis": "healthy",
    "elasticsearch": "healthy"
  }
}
```

---

## Troubleshooting

### Pod Won't Become Ready

**Symptom:** Readiness probe failing, pod not receiving traffic

**Diagnosis:**
```bash
# Check readiness endpoint
kubectl exec <pod> -- curl -s http://localhost:3000/health/ready | jq '.dependencies'

# Check pod logs
kubectl logs <pod> | grep -A5 "realtime\|elasticsearch\|firestore"

# Check environment variables
kubectl exec <pod> -- env | grep -E "REDIS|ELASTICSEARCH|FIRESTORE"
```

**Common Causes & Fixes:**
| Issue | Symptom | Fix |
|-------|---------|-----|
| Redis unavailable | `redis.status: "unhealthy"` | Verify REDIS_URL is correct; check Redis cluster health |
| Elasticsearch timeout | `search.status: "unhealthy"` | Verify ELASTICSEARCH_URL reachable; check ES cluster logs |
| Firestore credentials missing | `firestore.status: "unhealthy"` | Verify FIRESTORE_PROJECT_ID and GCP service account mounted |
| Network policy blocking probe | Probe times out | Check NetworkPolicy allows port 3000 from kubelet |

### Search Falls Back to PostgreSQL in Production

**Symptom:** Search queries slower than expected; logs show "fallback to PostgreSQL"

**Diagnosis:**
```bash
# Check health endpoint
kubectl exec <pod> -- curl -s http://localhost:3000/health/ready | jq '.dependencies.search'

# Check Elasticsearch visibility from pod
kubectl exec <pod> -- curl -s ${ELASTICSEARCH_URL} | jq '.'
```

**Expected Behavior:** Once Elasticsearch recovers, search automatically switches back to ES. No manual intervention required.

### Degraded Status in Production

**Symptom:** `/health/ready` returns status `degraded` but pod is receiving traffic

**Diagnosis:**
```bash
# Show which dependency is degraded
kubectl exec <pod> -- curl -s http://localhost:3000/health/ready | jq '.dependencies[] | select(.status!="healthy")'
```

**Action:** 
- If search degraded: Optional (PostgreSQL fallback active); monitor ES
- If redis degraded: Optional in single-instance mode; critical for multi-instance (page on-call)
- If razorpay degraded: Optional (payments graceful fallback); monitor payment retry queue
- If firestore degraded: Critical (pod should not be ready); investigate immediately

---

## Summary

| Deployment Mode | Best For | Redis | Elasticsearch | Overall Status |
|---|---|---|---|---|
| **Bare** | Single-instance, dev, small schools | âŒ | âŒ | `degraded` (optional deps unavailable) |
| **Redis** | Multi-instance, medium schools, HA | âœ… | âŒ | `healthy` (realtime scaled, search fallback) |
| **Full Stack** | Large scale, enterprise, high-performance | âœ… | âœ… | `healthy` (all optimizations active) |

All modes keep the service operational. Optional dependencies enable scaling and performance; required dependencies (Firestore, Razorpay) determine overall health.

