/**
 * useOfflineAttendance.ts — Offline-first attendance marking for teachers.
 *
 * Provides optimistic UI updates with automatic queue fallback.
 * When offline, mutations are persisted to AsyncStorage and flushed
 * when connectivity is restored.
 *
 * Usage:
 *   const { markSingle, markBulk, pendingCount, isSyncing } = useOfflineAttendance({
 *     classId, sectionId, date, session, onStudentsChange: setStudents
 *   });
 */

import { useCallback, useRef, useState } from "react";
import {
  upsertAttendance,
  bulkMarkAttendance,
  type BulkAttendancePayload,
} from "../services/attendanceService";
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  getOfflineQueueSize,
} from "../services/offlineSyncQueue";

// ─── Types ───────────────────────────────────────────────────────────────────

type AttendanceStatus = "Present" | "Absent" | "Late" | "Excused";

interface StudentState {
  id: string;
  status: "Present" | "Absent" | "Late" | "Excused" | "Not Marked";
  [key: string]: unknown;
}

interface UseOfflineAttendanceOptions {
  classId: string;
  sectionId: string;
  date: string;
  session: "FN" | "AN";
  /** Whether the device is currently online (from useNetworkSync). */
  isOnline: boolean;
}

export interface MarkResult {
  /** true if the backend confirmed the write */
  synced: boolean;
  /** true if queued for offline retry */
  queued: boolean;
}

interface UseOfflineAttendanceReturn {
  /**
   * Mark a single student's attendance with optimistic UI.
   * Returns whether it was synced immediately or queued for later.
   */
  markSingle: (studentId: string, status: AttendanceStatus) => Promise<MarkResult>;
  /**
   * Mark multiple students at once (bulk). Optimistic + queue fallback.
   */
  markBulk: (studentIds: string[], status: "Present" | "Absent") => Promise<MarkResult>;
  /** Number of attendance items pending in the offline queue. */
  pendingCount: number;
  /** Refresh the pending count from storage. */
  refreshPending: () => Promise<void>;
}

// ─── Dedup Key Builder ───────────────────────────────────────────────────────

/**
 * Build a deterministic dedup key for an attendance mutation.
 * Format: `att:{studentId}:{date}:{session}`
 *
 * If the teacher changes a student's status multiple times while offline,
 * only the latest value is kept in the queue.
 */
function attendanceDedupKey(studentId: string, date: string, session: string): string {
  return `att:${studentId}:${date}:${session}`;
}

/**
 * Build a dedup key for a bulk attendance mutation.
 * Format: `att-bulk:{classId}:{sectionId}:{date}:{session}`
 */
function bulkDedupKey(classId: string, sectionId: string, date: string, session: string): string {
  return `att-bulk:${classId}:${sectionId}:${date}:${session}`;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useOfflineAttendance(
  options: UseOfflineAttendanceOptions
): UseOfflineAttendanceReturn {
  const { classId, sectionId, date, session, isOnline } = options;
  const [pendingCount, setPendingCount] = useState(0);
  const inflightRef = useRef(new Set<string>());

  const refreshPending = useCallback(async () => {
    try {
      const count = await getOfflineQueueSize();
      setPendingCount(count);
    } catch {
      // Non-critical
    }
  }, []);

  /**
   * Mark a single student. Tries online first; falls back to queue.
   */
  const markSingle = useCallback(
    async (studentId: string, status: AttendanceStatus): Promise<MarkResult> => {
      const key = attendanceDedupKey(studentId, date, session);

      // Prevent duplicate in-flight requests for the same student
      if (inflightRef.current.has(key)) {
        return { synced: false, queued: false };
      }

      inflightRef.current.add(key);

      try {
        // If we know we're offline, skip the network call entirely
        if (!isOnline) {
          await enqueueOfflineMutation({
            path: "/attendance",
            method: "POST",
            body: { studentId, date, status, classId, sectionId, session },
            dedupKey: key,
          });
          await refreshPending();
          return { synced: false, queued: true };
        }

        // Try online
        try {
          await upsertAttendance({
            studentId,
            classId,
            sectionId,
            date,
            session,
            status,
          });
          return { synced: true, queued: false };
        } catch {
          // Online failed — queue for later
          await enqueueOfflineMutation({
            path: "/attendance",
            method: "POST",
            body: { studentId, date, status, classId, sectionId, session },
            dedupKey: key,
          });
          await refreshPending();
          return { synced: false, queued: true };
        }
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [classId, sectionId, date, session, isOnline, refreshPending]
  );

  /**
   * Mark multiple students at once. Uses bulk endpoint online;
   * falls back to a single bulk queue entry.
   */
  const markBulk = useCallback(
    async (studentIds: string[], status: "Present" | "Absent"): Promise<MarkResult> => {
      const payload: BulkAttendancePayload = {
        classId,
        sectionId,
        date,
        session,
        entries: studentIds.map((id) => ({ studentId: id, status })),
      };

      const key = bulkDedupKey(classId, sectionId, date, session);

      if (!isOnline) {
        await enqueueOfflineMutation({
          path: "/attendance/bulk",
          method: "POST",
          body: payload,
          dedupKey: key,
        });
        await refreshPending();
        return { synced: false, queued: true };
      }

      try {
        await bulkMarkAttendance(payload);
        return { synced: true, queued: false };
      } catch {
        await enqueueOfflineMutation({
          path: "/attendance/bulk",
          method: "POST",
          body: payload,
          dedupKey: key,
        });
        await refreshPending();
        return { synced: false, queued: true };
      }
    },
    [classId, sectionId, date, session, isOnline, refreshPending]
  );

  return { markSingle, markBulk, pendingCount, refreshPending };
}
