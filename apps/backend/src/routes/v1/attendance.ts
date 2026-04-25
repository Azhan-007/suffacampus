import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { markAttendanceSchema } from "../../schemas/attendance.schema";
import { bulkAttendanceSchema } from "../../schemas/admin.schema";
import {
  markAttendance,
  getAttendanceByDate,
  updateAttendance,
  deleteAttendance,
  AttendanceError,
} from "../../services/attendance.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { requirePermission } from "../../middleware/permission";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { AppError, Errors } from "../../errors";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../services/audit.service";
import { validateAttendanceDate } from "../../services/validation.service";
import { dateTimeFrom } from "../../utils/safe-fields";

const preHandler = [
  authenticate,
  tenantGuard,
];

export default async function attendanceRoutes(server: FastifyInstance) {
  // POST /api/v1/attendance — mark attendance for a student
  server.post(
    "/attendance",
    { preHandler: [...preHandler, requirePermission("ATTENDANCE_MARK")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = markAttendanceSchema.safeParse(request.body);

      if (!result.success) {
        throw Errors.validation(result.error.flatten().fieldErrors);
      }

      try {
          // Validate temporal constraints before marking
          validateAttendanceDate(result.data.date);

        const record = await markAttendance(
          request.schoolId,
          request.user.uid,
          result.data
        );

        return sendSuccess(request, reply, record, 201);
      } catch (err) {
        if (err instanceof AttendanceError) {
          const statusMap = {
            STUDENT_NOT_FOUND: 404,
            CROSS_TENANT: 403,
            DUPLICATE: 409,
          } as const;

          throw new AppError(
            statusMap[err.code],
            `ATTENDANCE_${err.code}`,
            err.message
          );
        }

        throw err;
      }
    }
  );

  // GET /api/v1/attendance?date=YYYY-MM-DD&classId=xxx&sectionId=yyy&session=FN
  server.get<{ Querystring: { date?: string; classId?: string; sectionId?: string; session?: string } }>(
    "/attendance",
    { preHandler: [...preHandler, requirePermission("ATTENDANCE_VIEW")] },
    async (request, reply) => {
      const { date, classId, sectionId, session } = request.query;

      // Backward compatibility: if date is omitted, return recent records
      if (!date) {
        const where: Record<string, unknown> = { schoolId: request.schoolId };
        if (classId) where.classId = classId;
        if (sectionId) where.sectionId = sectionId;
        if (session) where.session = session;

        const records = await prisma.attendance.findMany({
          where,
          orderBy: [{ date: "desc" }, { studentName: "asc" }],
          take: 2000,
        });

        return sendSuccess(request, reply, records);
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw Errors.badRequest(
          "Query param 'date' must be in YYYY-MM-DD format"
        );
      }

      const records = await getAttendanceByDate(request.schoolId, date, classId, sectionId, session);

      return sendSuccess(request, reply, records);
    }
  );

  // POST /api/v1/attendance/bulk — mark attendance for an entire class at once
  server.post(
    "/attendance/bulk",
    { preHandler: [...preHandler, requirePermission("ATTENDANCE_MARK")] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = bulkAttendanceSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
  // Validate temporal constraints before marking
  validateAttendanceDate(result.data.date);


      const { classId, sectionId, date, entries } = result.data;
      const session = (result.data as any).session ?? "FN";
      const schoolId = request.schoolId;
      const markedBy = request.user.uid;
      const attendanceDate = dateTimeFrom(date);

      if (!attendanceDate) {
        throw Errors.badRequest("Invalid attendance date");
      }

      const studentIds = Array.from(new Set(entries.map((entry) => entry.studentId)));
      const existing = await prisma.attendance.findMany({
        where: {
          schoolId,
          date: attendanceDate,
          session,
          studentId: { in: studentIds },
        },
        select: { studentId: true },
      });

      const existingStudentIds = new Set(existing.map((row) => row.studentId));
      const errors: Array<{ studentId: string; error: string }> = [];
      const rowsToCreate = entries
        .filter((entry) => {
          if (existingStudentIds.has(entry.studentId)) {
            errors.push({ studentId: entry.studentId, error: "Duplicate attendance" });
            return false;
          }

          return true;
        })
        .map((entry) => ({
          schoolId,
          studentId: entry.studentId,
          classId,
          sectionId,
          date: attendanceDate,
          session,
          status: entry.status,
          remarks: entry.remarks ?? null,
          markedBy,
        }));

      const created = rowsToCreate.length
        ? await prisma.attendance.createMany({
            data: rowsToCreate,
            skipDuplicates: true,
          })
        : { count: 0 };

      await writeAuditLog("BULK_ATTENDANCE", markedBy, schoolId, {
        date,
        classId,
        sectionId,
        totalEntries: entries.length,
        created: created.count,
        errors: errors.length,
      });

      return sendSuccess(request, reply, {
        created: created.count,
        errors,
        total: entries.length,
      }, 201);
    }
  );

  // GET /api/v1/attendance/stats — attendance statistics
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/attendance/stats",
    { preHandler: [...preHandler, requirePermission("ATTENDANCE_VIEW")] },
    async (request, reply) => {
      const { classId, sectionId, fromDate, toDate } = request.query;

      const where: Record<string, unknown> = { schoolId: request.schoolId };
      if (classId) where.classId = classId;
      if (sectionId) where.sectionId = sectionId;

      const parsedFromDate = fromDate ? dateTimeFrom(fromDate) : null;
      const parsedToDate = toDate ? dateTimeFrom(toDate) : null;

      if (fromDate && !parsedFromDate) {
        throw Errors.badRequest("fromDate must be in YYYY-MM-DD format");
      }
      if (toDate && !parsedToDate) {
        throw Errors.badRequest("toDate must be in YYYY-MM-DD format");
      }

      if (parsedFromDate || parsedToDate) {
        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (parsedFromDate) {
          dateFilter.gte = parsedFromDate;
        }
        if (parsedToDate) {
          const endOfDay = new Date(parsedToDate);
          endOfDay.setUTCHours(23, 59, 59, 999);
          dateFilter.lte = endOfDay;
        }
        where.date = dateFilter;
      }

      const grouped = await prisma.attendance.groupBy({
        by: ["status"],
        where: where as any,
        _count: { _all: true },
      });

      const stats = { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
      for (const row of grouped) {
        const count = row._count._all;
        stats.total += count;
        if (row.status === "Present") stats.present = count;
        if (row.status === "Absent") stats.absent = count;
        if (row.status === "Late") stats.late = count;
        if (row.status === "Excused") stats.excused = count;
      }

      const attendanceRate = stats.total > 0
        ? Math.round(((stats.present + stats.late) / stats.total) * 100 * 100) / 100
        : 0;

      return sendSuccess(request, reply, { ...stats, attendanceRate });
    }
  );

  // PATCH /api/v1/attendance/:id — update an attendance record
  server.patch<{ Params: { id: string } }>(
    "/attendance/:id",
    {
      preHandler: [
        ...preHandler,
        requirePermission("ATTENDANCE_UPDATE"),
      ],
    },
    async (request, reply) => {
      const body = request.body as { status?: string; remarks?: string };

      if (!body.status && body.remarks === undefined) {
        throw Errors.badRequest("Provide at least 'status' or 'remarks' to update");
      }

      if (body.status && !["Present", "Absent", "Late", "Excused"].includes(body.status)) {
        throw Errors.badRequest("Invalid status. Valid: Present, Absent, Late, Excused");
      }

      const record = await updateAttendance(
        request.params.id,
        request.schoolId,
        body,
        request.user.uid
      );

      if (!record) {
        throw Errors.notFound("Attendance record", request.params.id);
      }

      return sendSuccess(request, reply, record);
    }
  );

  // DELETE /api/v1/attendance/:id — delete an attendance record
  server.delete<{ Params: { id: string } }>(
    "/attendance/:id",
    {
      preHandler: [
        ...preHandler,
        roleMiddleware(["Admin", "SuperAdmin"]),
      ],
    },
    async (request, reply) => {
      const deleted = await deleteAttendance(
        request.params.id,
        request.schoolId,
        request.user.uid
      );

      if (!deleted) {
        throw Errors.notFound("Attendance record", request.params.id);
      }

      return sendSuccess(request, reply, { message: "Attendance record deleted" });
    }
  );

  // ─── Student-accessible routes ─────────────────────────────────────────────

  const studentPreHandler = [authenticate, tenantGuard];

  // GET /attendance/student/:studentId — full attendance history for a student
  server.get<{ Params: { studentId: string }; Querystring: Record<string, string | undefined> }>(
    "/attendance/student/:studentId",
    { preHandler: [...studentPreHandler, requirePermission("ATTENDANCE_VIEW")] },
    async (request, reply) => {
      const { studentId } = request.params;
      const { fromDate, toDate } = request.query;

      // Students can only view their own attendance
      const user = request.user;
      if (user.role === "Student" && user.studentId !== studentId) {
        throw new AppError(403, "FORBIDDEN", "You can only view your own attendance");
      }

      const parsedFromDate = fromDate ? dateTimeFrom(fromDate) : null;
      const parsedToDate = toDate ? dateTimeFrom(toDate) : null;

      if (fromDate && !parsedFromDate) {
        throw Errors.badRequest("fromDate must be in YYYY-MM-DD format");
      }
      if (toDate && !parsedToDate) {
        throw Errors.badRequest("toDate must be in YYYY-MM-DD format");
      }

      const where: Record<string, unknown> = {
        schoolId: request.schoolId,
        studentId,
      };

      if (parsedFromDate || parsedToDate) {
        const dateFilter: { gte?: Date; lte?: Date } = {};
        if (parsedFromDate) {
          dateFilter.gte = parsedFromDate;
        }
        if (parsedToDate) {
          const endOfDay = new Date(parsedToDate);
          endOfDay.setUTCHours(23, 59, 59, 999);
          dateFilter.lte = endOfDay;
        }
        where.date = dateFilter;
      }

      const records = await prisma.attendance.findMany({
        where: where as any,
        orderBy: { date: "desc" },
        take: 200,
      });

      // Compute summary stats
      const total = records.length;
      const present = records.filter((r) => r.status === "Present").length;
      const absent = records.filter((r) => r.status === "Absent").length;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      return sendSuccess(request, reply, {
        records,
        stats: { total, present, absent, percentage },
      });
    }
  );
}
