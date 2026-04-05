# Data Backup & Disaster Recovery

## Overview

SuffaCampus uses **Google Cloud Firestore** as its primary data store. This document
covers the backup strategy, restore procedures, and retention policies for
production data.

---

## 1. Automated Daily Backups (Firestore Export)

Google Cloud provides managed Firestore exports to Cloud Storage.

### Setup (one-time)

```bash
# Create a dedicated GCS bucket for backups
gsutil mb -l asia-south1 gs://SuffaCampus-backups

# Set lifecycle policy â€” auto-delete after 90 days
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 90 }
    }
  ]
}
EOF
gsutil lifecycle set /tmp/lifecycle.json gs://SuffaCampus-backups
```

### Daily Export (Cloud Scheduler + Cloud Function)

```bash
# Create a Cloud Scheduler job (runs daily at 2:00 AM IST)
gcloud scheduler jobs create http firestore-daily-backup \
  --schedule="0 2 * * *" \
  --uri="https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default)/exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email=YOUR_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --headers="Content-Type=application/json" \
  --message-body='{"outputUriPrefix":"gs://SuffaCampus-backups/daily"}'
```

### Collections Exported

All collections are included by default:

| Collection       | Contains                        | Sensitivity |
|------------------|---------------------------------|-------------|
| `schools`        | School config, subscription     | High        |
| `users`          | Auth records, roles             | High        |
| `students`       | Student profiles                | High (PII)  |
| `teachers`       | Teacher profiles                | High (PII)  |
| `attendance`     | Attendance records              | Medium      |
| `classes`        | Class/section definitions       | Low         |
| `fees`           | Fee structures & payments       | High        |
| `results`        | Exam results                    | High        |
| `events`         | School events                   | Low         |
| `library`        | Book inventory                  | Low         |
| `timetable`      | Schedule data                   | Low         |
| `invoices`       | Billing invoices                | High        |
| `payments`       | Payment records                 | High        |
| `notifications`  | In-app notifications            | Low         |
| `deviceTokens`   | FCM push tokens                 | Medium      |
| `auditLogs`      | Audit trail                     | High        |
| `webhookFailures`| Failed webhook deliveries       | Medium      |
| `usageSnapshots` | Daily usage metrics             | Low         |

---

## 2. Restore Procedure

### Restore from Daily Backup

```bash
# List available backups
gsutil ls gs://SuffaCampus-backups/daily/

# Restore a specific backup (CAUTION: overwrites existing data)
gcloud firestore import gs://SuffaCampus-backups/daily/2025-02-27T02:00:00_12345/
```

### Selective Collection Restore

```bash
# Restore only specific collections
gcloud firestore import \
  gs://SuffaCampus-backups/daily/2025-02-27T02:00:00_12345/ \
  --collection-ids=schools,users,students
```

### Point-in-Time Recovery (PITR)

Firestore offers PITR for up to **7 days** on the Blaze plan:

```bash
# Recover to a specific timestamp
gcloud firestore databases restore \
  --source-database='(default)' \
  --destination-database='restore-target' \
  --snapshot-time='2025-02-26T14:30:00Z'
```

---

## 3. Retention Policy

| Backup Type       | Retention | Storage Location            |
|--------------------|-----------|-----------------------------|
| Daily export       | 90 days   | `gs://SuffaCampus-backups/daily/` |
| Weekly snapshot    | 1 year    | `gs://SuffaCampus-backups/weekly/` |
| Pre-migration      | Permanent | `gs://SuffaCampus-backups/migrations/` |
| PITR (managed)     | 7 days    | Firestore internal          |

### Weekly Snapshots

Create a weekly snapshot every Sunday that's kept for 1 year:

```bash
gcloud scheduler jobs create http firestore-weekly-backup \
  --schedule="0 3 * * 0" \
  --uri="https://firestore.googleapis.com/v1/projects/YOUR_PROJECT_ID/databases/(default)/exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email=YOUR_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --headers="Content-Type=application/json" \
  --message-body='{"outputUriPrefix":"gs://SuffaCampus-backups/weekly"}'
```

Set a 365-day lifecycle on the weekly prefix:

```bash
# Use a separate lifecycle rule for the weekly prefix
gsutil lifecycle set /tmp/weekly-lifecycle.json gs://SuffaCampus-backups
```

---

## 4. Pre-Migration Backups

Before any schema migration or data migration, **always** create a labeled backup:

```bash
# Manual backup before migration
gcloud firestore export gs://SuffaCampus-backups/migrations/pre-v2.0-$(date +%Y%m%d)/
```

---

## 5. File Storage Backups

User-uploaded files (profile photos, library documents) are stored in
**Firebase Cloud Storage** (`gs://SuffaCampus-uploads/`).

Cloud Storage has built-in:
- **Object versioning** â€” enabled on the bucket
- **Cross-region replication** â€” if using multi-region bucket

```bash
# Enable versioning
gsutil versioning set on gs://SuffaCampus-uploads
```

---

## 6. Monitoring & Alerts

### Backup Success Monitoring

Set up a Cloud Monitoring alert that fires if no backup file appears
in `gs://SuffaCampus-backups/daily/` within the last 26 hours.

```yaml
# Alert policy (pseudo-config)
displayName: "Firestore Backup Missing"
conditions:
  - conditionAbsent:
      filter: 'resource.type="gcs_bucket" AND resource.labels.bucket_name="SuffaCampus-backups"'
      duration: "93600s"  # 26 hours
notificationChannels:
  - projects/YOUR_PROJECT/notificationChannels/YOUR_CHANNEL
```

### Backup Size Tracking

Track backup sizes over time to detect anomalies (sudden drops may
indicate data loss):

```bash
# Check latest backup size
gsutil du -s gs://SuffaCampus-backups/daily/$(date +%Y-%m-%d)*/
```

---

## 7. Disaster Recovery Playbook

### Scenario: Accidental Data Deletion

1. **Identify** the time of deletion from audit logs (`auditLogs` collection)
2. **Use PITR** if within 7 days: restore to timestamp before deletion
3. **Otherwise** use the most recent daily backup
4. Restore to a **staging database** first, verify data, then swap

### Scenario: Corrupted Data (Bad Migration)

1. Revert the migration code
2. Import the pre-migration backup from `gs://SuffaCampus-backups/migrations/`
3. Fix the migration script
4. Re-run on staging, verify, then apply to production

### Scenario: Complete Database Loss

1. Import the latest daily backup
2. Accept up to 24 hours of data loss (RPO = 24h)
3. Cross-reference with payment gateway (Razorpay) for missing transactions
4. Notify affected schools via email

### Recovery Time Objectives

| Metric | Target    |
|--------|-----------|
| RPO    | 24 hours  |
| RTO    | 4 hours   |

---

## 8. Security

- Backup bucket has **uniform bucket-level access** (no per-object ACLs)
- Only the CI/CD service account and infrastructure team have access
- Backups are **encrypted at rest** (Google-managed keys; CMEK optional)
- Access is logged via **Cloud Audit Logs**

```bash
# Grant backup access only to the infra team
gsutil iam ch group:infra@SuffaCampus.in:objectViewer gs://SuffaCampus-backups
```

