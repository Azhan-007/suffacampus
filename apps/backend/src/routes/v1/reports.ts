import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { AttendanceStatus } from "@prisma/client";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { prisma } from "../../lib/prisma";
import { generateReport, ReportType } from "../../services/report.service";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";
import { z } from "zod";

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
});

export default async function reportRoutes(server: FastifyInstance) {
  const adminChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "SuperAdmin", "Principal"]),
  ];

  const dashboardChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "Staff", "SuperAdmin"]),
  ];

  // -----------------------------------------------------------------------
  // GET /reports/dashboard — dashboard report skeleton
  // -----------------------------------------------------------------------
  server.get(
    "/reports/dashboard",
    { preHandler: dashboardChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      console.log("ROLE INSIDE ROUTE:", request.user.role);

      const schoolId = request.user.schoolId;
      if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
        throw Errors.tenantMissing();
      }

      const today = new Date().toISOString().slice(0, 10);

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
            date: today,
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
        prisma.studentFee.aggregate({
          where: { schoolId },
          _sum: {
            totalAmount: true,
            paidAmount: true,
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

      const total = feeTotals._sum.totalAmount ?? 0;
      const collected = feeTotals._sum.paidAmount ?? 0;
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
    { preHandler: adminChain },
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

      const result = await generateReport({
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
        type: result.type,
        stats: result.stats,
        generatedAt: result.generatedAt,
        deliveredTo: result.deliveredTo,
        // HTML is large — only included when explicitly requested
        html: result.html,
      });
    }
  );

  // -----------------------------------------------------------------------
  // GET /reports — list previously generated reports
  // -----------------------------------------------------------------------
  server.get(
    "/reports",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.user.schoolId;
      if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
        throw Errors.tenantMissing();
      }
      const query = request.query as Record<string, string>;
      const limit = Math.min(parseInt(query.limit) || 20, 100);

      const { firestore } = await import("../../lib/firebase-admin.js");
      const snapshot = await firestore
        .collection("reports")
        .where("schoolId", "==", schoolId)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const reports = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const data = doc.data();
        // Don't send full HTML in list view
        const { html, ...rest } = data;
        return rest;
      });

      return sendSuccess(request, reply, reports);
    }
  );
}
