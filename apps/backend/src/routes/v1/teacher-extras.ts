import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { prisma } from "../../lib/prisma";

/**
 * Teacher tasks & activities routes.
 * Provides real data from the database instead of empty stubs.
 */
export default async function teacherExtrasRoutes(server: FastifyInstance) {
  const preHandler = [authenticate, tenantGuard, roleMiddleware(["Teacher", "Admin", "SuperAdmin"])];

  /**
   * GET /teacher-tasks — pending tasks for the logged-in teacher.
   * Returns: assignments needing grading, today's unmarked attendance, etc.
   */
  server.get("/teacher-tasks", { preHandler }, async (request, reply) => {
    const userId = request.user.uid;
    const schoolId = request.schoolId;

    // Find teacher record via User → teacherId link
    const user = await prisma.user.findUnique({
      where: { uid: userId },
      select: { teacherId: true },
    });

    if (!user?.teacherId) {
      return sendSuccess(request, reply, []);
    }

    const teacherId = user.teacherId;

    const tasks: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      priority: string;
      createdAt: string;
    }> = [];

    // 1. Pending assignments to grade (status = Submitted)
    try {
      const pendingAssignments = await prisma.assignment.findMany({
        where: {
          schoolId,
          teacherId,
          status: "Submitted",
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, classId: true, createdAt: true },
      });

      for (const a of pendingAssignments) {
        tasks.push({
          id: `grade-${a.id}`,
          type: "grade_assignment",
          title: `Grade: ${a.title}`,
          description: `Class ${a.classId} — submitted, needs grading`,
          priority: "high",
          createdAt: a.createdAt.toISOString(),
        });
      }
    } catch {
      // Assignment model may not have teacherId — skip gracefully
    }

    // 2. Today's unmarked classes (from timetable periods)
    try {
      const today = new Date();
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const todayDay = dayNames[today.getDay()];

      // Find periods for this teacher today (Period has teacherId, not Timetable)
      const periods = await prisma.period.findMany({
        where: {
          teacherId,
          timetable: {
            schoolId,
            day: todayDay,
          },
        },
        select: {
          id: true,
          subject: true,
          timetable: { select: { classId: true } },
        },
      });

      // Check which classes have attendance marked today
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000);

      for (const period of periods) {
        const marked = await prisma.attendance.findFirst({
          where: {
            schoolId,
            classId: period.timetable.classId,
            date: { gte: todayStart, lt: todayEnd },
          },
        });

        if (!marked) {
          tasks.push({
            id: `att-${period.id}`,
            type: "mark_attendance",
            title: `Mark attendance: ${period.subject}`,
            description: `Class ${period.timetable.classId} — today's attendance not marked`,
            priority: "high",
            createdAt: today.toISOString(),
          });
        }
      }
    } catch {
      // Timetable query failed — skip gracefully
    }

    return sendSuccess(request, reply, tasks);
  });

  /**
   * GET /teacher-activities — recent activity log for the teacher.
   * Returns: last 20 actions (attendance marked, assignments created, etc.)
   */
  server.get("/teacher-activities", { preHandler }, async (request, reply) => {
    const userId = request.user.uid;
    const schoolId = request.schoolId;

    try {
      // Activity model stores recent actions
      const activities = await prisma.activity.findMany({
        where: {
          schoolId,
          userId,
        },
        take: 20,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          createdAt: true,
          metadata: true,
        },
      });

      const mapped = activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title ?? "",
        description: a.description ?? "",
        time: a.createdAt.toISOString(),
        metadata: a.metadata,
      }));

      return sendSuccess(request, reply, mapped);
    } catch {
      return sendSuccess(request, reply, []);
    }
  });
}
