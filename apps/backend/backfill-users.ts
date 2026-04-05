/**
 * One-time migration: backfill `username` and `name` fields on
 * existing teacher and student user docs in the `users` collection.
 *
 * Usage:
 *   npx tsx backfill-users.ts
 *
 * Safe to run multiple times — skips docs that already have both fields.
 */
import "dotenv/config";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

function buildUsername(firstName: string, lastName: string): string {
  const first = (firstName || "").trim().toLowerCase().replace(/\s+/g, "");
  const last = (lastName || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!first) return last || "user";
  if (!last) return first;
  return `${first}.${last}`;
}

async function backfill() {
  const usersSnap = await db.collection("users").get();
  let updated = 0;
  let skipped = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const role = (data.role || "").toLowerCase();

    // Only backfill teacher and student user docs
    if (role !== "teacher" && role !== "student") {
      skipped++;
      continue;
    }

    const updates: Record<string, unknown> = {};

    // Backfill name if missing
    if (!data.name) {
      const name = data.displayName
        || `${data.firstName || ""} ${data.lastName || ""}`.trim()
        || "";
      if (name) updates.name = name;
    }

    // Backfill username if missing (teachers only, or students if applicable)
    if (!data.username) {
      let username = "";
      if (data.firstName && data.lastName) {
        username = buildUsername(data.firstName, data.lastName);
      } else if (data.displayName) {
        const parts = data.displayName.split(" ");
        username = buildUsername(parts[0] || "", parts.slice(1).join(" ") || "");
      }
      if (username) updates.username = username;
    }

    // Backfill assignedClasses for teachers if present in teacher doc but not in user doc
    if (role === "teacher" && !data.assignedClasses && data.teacherId) {
      try {
        const teacherDoc = await db.collection("teachers").doc(data.teacherId).get();
        if (teacherDoc.exists) {
          const teacherData = teacherDoc.data();
          if (teacherData?.assignedClasses) {
            updates.assignedClasses = teacherData.assignedClasses;
          }

          // Also sync name from teacher doc if we still don't have one
          if (!updates.name && !data.name) {
            const tName = `${teacherData?.firstName || ""} ${teacherData?.lastName || ""}`.trim();
            if (tName) updates.name = tName;
          }
        }
      } catch {
        // Skip if teacher doc doesn't exist
      }
    }

    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      updated++;
      console.log(`  Updated ${doc.id} (${role}):`, updates);
    } else {
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

backfill().catch(console.error);
