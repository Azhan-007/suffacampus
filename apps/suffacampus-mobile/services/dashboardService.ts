/**
 * dashboardService.ts
 *
 * Aggregated data fetches for the Student Dashboard screen.
 * Each function corresponds to one Firestore collection previously queried directly.
 *
 * Backend routes:
 *   GET /students/:id            — student profile
 *   GET /carousel                — ordered carousel images
 *   GET /events?isActive=true    — upcoming events
 *   GET /activities?studentId=   — recent activity feed
 *   GET /results?studentId=      — recent results (limit passed as param)
 *   GET /assignments?class=      — assignments for class
 *   GET /attendance?studentId=   — attendance for today
 *   GET /config                  — admin app config
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../firebase";
import { apiFetch, BASE_URL } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StudentInfo {
  name: string;
  admissionNumber: string;
  class: string;
  section: string;
  photoURL: string;
}

export interface CarouselImage {
  id: string;
  uri: string;
  title: string;
  subtitle: string;
  order: number;
}

export interface DashboardEvent {
  id: string;
  title: string;
  date: string;
  icon: string;
  color: string;
  isActive: boolean;
  startDate?: string;
}

export interface DashboardActivity {
  id: string;
  type: string;
  title: string;
  time?: string;
  icon?: string;
  color?: string;
  timestamp?: string;
  studentId?: string;
}

type ActivityApiResponse =
  | DashboardActivity[]
  | {
      data?: DashboardActivity[];
      pagination?: {
        total?: number;
        limit?: number;
        skip?: number;
        hasMore?: boolean;
      };
    };

type ActivitySocketMessage = {
  type: "activity.connected" | "activity.created";
  data?: Partial<DashboardActivity> & {
    createdAt?: string;
    description?: string;
    actionUrl?: string | null;
  };
};

function activityVisualByType(type?: string): { icon: string; color: string } {
  switch ((type || "").toLowerCase()) {
    case "assignment":
      return { icon: "clipboard-text-outline", color: "#4C6EF5" };
    case "exam":
      return { icon: "file-document-outline", color: "#7C3AED" };
    case "event":
      return { icon: "calendar-star", color: "#F59E0B" };
    case "fee":
      return { icon: "currency-inr", color: "#10B981" };
    case "attendance":
      return { icon: "calendar-check", color: "#06B6D4" };
    case "announcement":
      return { icon: "bullhorn-outline", color: "#EF4444" };
    default:
      return { icon: "bell-outline", color: "#64748B" };
  }
}

function toRelativeTime(timestamp?: string): string {
  if (!timestamp) return "Just now";

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return "Just now";

  const diffSeconds = Math.max(Math.floor((now - then) / 1000), 0);
  if (diffSeconds < 60) return "Just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function normalizeActivity(input: Partial<DashboardActivity> & { createdAt?: string }): DashboardActivity {
  const timestamp = input.timestamp || input.createdAt;
  const visuals = activityVisualByType(input.type);

  return {
    id: input.id || `${Date.now()}`,
    type: input.type || "general",
    title: input.title || "Activity",
    studentId: input.studentId,
    timestamp,
    icon: input.icon || visuals.icon,
    color: input.color || visuals.color,
    time: input.time || toRelativeTime(timestamp),
  };
}

export interface RecentResult {
  id: string;
  subject: string;
  marks: number;
  total: number;
  grade: string;
  createdAt?: string;
}

export interface AssignmentStats {
  pending: number;
  submitted: number;
}

export interface AppConfig {
  resultsDisplayCount: number;
}

export interface TodayAttendance {
  todayFN: string;
  todayAN: string;
  monthlyPercentage: number;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/** Fetch student profile. Returns empty defaults on failure. */
export async function getStudentInfo(studentId: string): Promise<StudentInfo> {
  try {
    const raw = await apiFetch<{
      firstName: string;
      lastName: string;
      classId: string;
      sectionId: string;
      rollNumber: string;
      studentId?: string;
      photoURL?: string;
    }>(`/students/${studentId}`);

    // Resolve classId to human-readable class name + section name
    let className = "";
    let sectionName = "";
    if (raw.classId) {
      try {
        const classData = await apiFetch<{
          className: string;
          sections?: { id: string; sectionName: string }[];
        }>(`/classes/${raw.classId}`);
        className = classData.className ?? "";
        if (raw.sectionId && classData.sections) {
          const sec = classData.sections.find(
            (s) => s.id === raw.sectionId
          );
          sectionName = sec?.sectionName ?? "";
        }
      } catch {
        className = "";
      }
    }

    // Cache classId and sectionId for other screens (timetable, assignments, etc.)
    if (raw.classId) {
      AsyncStorage.setItem("classId", raw.classId).catch(() => {});
    }
    if (raw.sectionId) {
      AsyncStorage.setItem("sectionId", raw.sectionId).catch(() => {});
    }

    return {
      name: `${raw.firstName ?? ""} ${raw.lastName ?? ""}`.trim(),
      admissionNumber: raw.rollNumber ?? "",
      class: className,
      section: sectionName,
      photoURL: raw.photoURL ?? "",
    };
  } catch {
    return { name: "", admissionNumber: "", class: "", section: "", photoURL: "" };
  }
}

/** Fetch ordered carousel images. Endpoint may not exist yet — returns [] so dashboard uses fallback images. */
export async function getCarouselImages(): Promise<CarouselImage[]> {
  try {
    return await apiFetch<CarouselImage[]>("/carousel");
  } catch {
    return [];
  }
}

/** Fetch upcoming events. Backend supports ?upcoming=true&limit= */
export async function getActiveEvents(limit = 5): Promise<DashboardEvent[]> {
  try {
    return await apiFetch<DashboardEvent[]>("/events", {
      params: { upcoming: true, limit },
    });
  } catch {
    return [];
  }
}

/** Fetch student's recent activity feed. Endpoint may not exist yet — returns [] gracefully. */
export async function getStudentDashboardActivities(
  studentId: string,
  limit = 5
): Promise<DashboardActivity[]> {
  try {
    const response = await apiFetch<ActivityApiResponse>("/activities", {
      params: { studentId, limit },
    });

    const list = Array.isArray(response)
      ? response
      : Array.isArray(response?.data)
      ? response.data
      : [];

    return list.map((item) => normalizeActivity(item));
  } catch {
    return [];
  }
}

export async function subscribeStudentDashboardActivities(
  studentId: string,
  onActivity: (activity: DashboardActivity) => void
): Promise<() => void> {
  const user = auth.currentUser;
  if (!user) return () => {};

  let socket: WebSocket | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  try {
    const token = await user.getIdToken();
    const wsBase = BASE_URL.replace(/^http/i, "ws");
    const query = `studentId=${encodeURIComponent(studentId)}&token=${encodeURIComponent(token)}`;
    const socketUrl = `${wsBase}/activities/stream?${query}`;

    socket = new WebSocket(socketUrl);

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : "";
      if (!raw || raw === "pong") return;

      try {
        const message = JSON.parse(raw) as ActivitySocketMessage;
        if (message.type !== "activity.created" || !message.data) return;
        onActivity(normalizeActivity(message.data));
      } catch {
        // Ignore malformed socket payloads from upstream/network intermediaries
      }
    };

    socket.onopen = () => {
      keepAliveTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send("ping");
        }
      }, 25_000);
    };
  } catch {
    return () => {};
  }

  return () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}

/** Fetch recent results for the student. */
export async function getRecentResults(
  studentId: string,
  limit = 3
): Promise<RecentResult[]> {
  try {
    const data = await apiFetch<RecentResult[]>("/results", {
      params: { studentId, limit },
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Fetch assignment stats for a class. Counts active assignments as "pending" for the student. */
export async function getAssignmentStats(
  classId: string
): Promise<AssignmentStats> {
  try {
    const assignments = await apiFetch<
      Array<{ id: string; status: string; submissionStatus?: string }>
    >("/assignments", { params: { class: classId } });

    const arr = Array.isArray(assignments) ? assignments : [];
    const pending = arr.filter((a) => a.status === "active" && a.submissionStatus !== "submitted" && a.submissionStatus !== "graded").length;
    const submitted = arr.filter((a) => a.submissionStatus === "submitted" || a.submissionStatus === "graded").length;
    return { pending, submitted };
  } catch {
    return { pending: 0, submitted: 0 };
  }
}

/** Fetch today's attendance for a student using the student attendance endpoint. */
export async function getTodayAttendance(
  studentId: string
): Promise<TodayAttendance> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await apiFetch<{
      records: Array<{ date: string; session: string; status: string }>;
      stats: { total: number; present: number; absent: number; percentage: number };
    }>(`/attendance/student/${studentId}`);

    const todayRecords = (data.records ?? []).filter((r) => r.date === today);
    const todayFN =
      todayRecords.find((r) => r.session === "FN")?.status ?? "Not Marked";
    const todayAN =
      todayRecords.find((r) => r.session === "AN")?.status ?? "Not Marked";

    return {
      todayFN,
      todayAN,
      monthlyPercentage: data.stats?.percentage ?? 0,
    };
  } catch {
    return { todayFN: "Not Marked", todayAN: "Not Marked", monthlyPercentage: 0 };
  }
}

/** Fetch admin app configuration. Falls back to defaults if endpoint unavailable. */
export async function getAppConfig(): Promise<AppConfig> {
  try {
    const raw = await apiFetch<Record<string, unknown>>("/settings");
    return {
      resultsDisplayCount: typeof raw?.resultsDisplayCount === "number"
        ? raw.resultsDisplayCount
        : 3,
    };
  } catch {
    return { resultsDisplayCount: 3 };
  }
}
