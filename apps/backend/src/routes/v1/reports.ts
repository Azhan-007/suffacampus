import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AttendanceStatus } from "@prisma/client";
import { apiKeyOrUserAuth } from "../../middleware/apiKey";
import {
  analyticsRateLimitProfile,
  exportsRateLimitProfile,
} from "../../plugins/rateLimit";
import { prisma } from "../../lib/prisma";
import { enqueueReport, type ReportType } from "../../services/report.service";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { z } from "zod";
import { moneyToNumber } from "../../utils/safe-fields";

const reportSchema = z.object({
  type: z.enum([
    "attendance_weekly",
    "attendance_monthly",
    "fee_summary",
    "student_performance",
    "class_analytics",
  ]),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
  filters: z.record(z.string(), z.string()).optional(),
  recipientEmails: z.array(z.string().email()).optional(),
}).strict();

export default async function reportRoutes(server: FastifyInstance) {
  const adminAccess = apiKeyOrUserAuth({
    requiredPermission: "reports:write",
    allowedRoles: ["Admin", "SuperAdmin", "Principal"],
  });

  const dashboardAccess = apiKeyOrUserAuth({
    requiredPermission: "analytics:read",
    allowedRoles: ["Admin", "Staff", "SuperAdmin"],
  });

  const reportReadAccess = apiKeyOrUserAuth({
    requiredPermission: "reports:read",
    allowedRoles: ["Admin", "SuperAdmin", "Principal"],
  });

  // -----------------------------------------------------------------------
  // GET /reports/dashboard — dashboard report skeleton
  // -----------------------------------------------------------------------
  server.get(
    "/reports/dashboard",
    {
      config: { rateLimit: analyticsRateLimitProfile },
      preHandler: [dashboardAccess],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.user.schoolId;
      if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
        throw Errors.tenantMissing();
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const nextDayStart = new Date(dayStart);
      nextDayStart.setDate(nextDayStart.getDate() + 1);

      const [
        totalStudents,
        attendanceRows,
        feeTotals,
      ] = await Promise.all([
        prisma.student.count({
          where: {
            schoolId,
            isDeleted: false,
          },
        }),
        prisma.attendance.groupBy({
          by: ["status"],
          where: {
            schoolId,
            date: { gte: dayStart, lt: nextDayStart },
            status: {
              in: [
                AttendanceStatus.Present,
                AttendanceStatus.Absent,
                AttendanceStatus.Late,
              ],
            },
          },
          _count: { _all: true },
        }),
        // Use Fee model (same as dashboard.service.ts) to avoid
        // contradictory financial totals between dashboard and reports
        prisma.fee.aggregate({
          where: { schoolId },
          _sum: {
            amount: true,
            amountPaid: true,
          },
        }),
      ]);

      const attendance = {
        present: 0,
        absent: 0,
        late: 0,
      };

      for (const row of attendanceRows) {
        if (row.status === AttendanceStatus.Present) attendance.present = row._count._all;
        if (row.status === AttendanceStatus.Absent) attendance.absent = row._count._all;
        if (row.status === AttendanceStatus.Late) attendance.late = row._count._all;
      }

      const total = moneyToNumber(feeTotals._sum.amount);
      const collected = moneyToNumber(feeTotals._sum.amountPaid);
      const pending = total - collected;

      return sendSuccess(request, reply, {
        schoolId: request.schoolId,
        dashboard: {
          totalStudents,
          attendance,
          fees: {
            total,
            collected,
            pending,
          },
        },
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /reports/generate — generate a report
  // -----------------------------------------------------------------------
  server.post(
    "/reports/generate",
    {
      config: { rateLimit: exportsRateLimitProfile },
      preHandler: [adminAccess],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = reportSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.format());
      }

      const schoolId = request.user.schoolId;
      if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
        throw Errors.tenantMissing();
      }
      const userId = request.user!.uid;

      // Enqueue for background processing instead of blocking the request.
      // The worker (processPendingReports, runs every 60s) picks it up.
      // Clients poll GET /reports/:id for completion.
      const result = await enqueueReport({
        schoolId,
        type: parsed.data.type as ReportType,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        filters: parsed.data.filters,
        recipientEmails: parsed.data.recipientEmails,
        requestedBy: userId,
      });

      return sendSuccess(request, reply, {
        id: result.id,
        status: result.status,
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /reports — list previously generated reports
  // -----------------------------------------------------------------------
  server.get(
    "/reports",
    {
      config: { rateLimit: analyticsRateLimitProfile },
      preHandler: [reportReadAccess],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.user.schoolId;
      if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
        throw Errors.tenantMissing();
      }
      const query = request.query as Record<string, string>;
      const limit = Math.min(parseInt(query.limit) || 20, 100);

      const reports = await prisma.report.findMany({
        where: { schoolId },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return sendSuccess(request, reply, reports);
    }
  );
}
