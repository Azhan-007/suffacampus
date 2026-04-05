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
import { admin, firestore } from "../../lib/firebase-admin";
import { writeAuditLog } from "../../services/audit.service";
import { validateAttendanceDate } from "../../services/validation.service";

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

  // GET /api/v1/attendance?date=YYYY-MM-DD&classId=xxx&sectionId=yyy
  server.get<{ Querystring: { date?: string; classId?: string; sectionId?: string } }>(
    "/attendance",
    { preHandler: [...preHandler, requirePermission("ATTENDANCE_VIEW")] },
    async (request, reply) => {
      const { date, classId, sectionId } = request.query;

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw Errors.badRequest(
          "Query param 'date' is required in YYYY-MM-DD format"
        );
      }

      const records = await getAttendanceByDate(request.schoolId, date, classId, sectionId);

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
      const schoolId = request.schoolId;
      const markedBy = request.user.uid;
      const now = admin.firestore.Timestamp.now();

      // Process in batches of 500 (Firestore limit)
      const BATCH_SIZE = 500;
      const created: Array<Record<string, unknown>> = [];
      const errors: Array<{ studentId: string; error: string }> = [];

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const chunk = entries.slice(i, i + BATCH_SIZE);
        const batch = firestore.batch();

        for (const entry of chunk) {
          // Check for duplicates
          const dupSnap = await firestore
            .collection("attendance")
            .where("schoolId", "==", schoolId)
            .where("studentId", "==", entry.studentId)
            .where("date", "==", date)
            .limit(1)
            .get();

          if (!dupSnap.empty) {
            errors.push({ studentId: entry.studentId, error: "Duplicate attendance" });
            continue;
          }

          const docRef = firestore.collection("attendance").doc();
          const record = {
            id: docRef.id,
            schoolId,
            studentId: entry.studentId,
            classId,
            sectionId,
            date,
            status: entry.status,
            remarks: entry.remarks ?? null,
            markedBy,
            createdAt: now,
          };

          batch.set(docRef, record);
          created.push(record);
        }

        await batch.commit();
      }

      await writeAuditLog("BULK_ATTENDANCE", markedBy, schoolId, {
        date,
        classId,
        sectionId,
        totalEntries: entries.length,
        created: created.length,
        errors: errors.length,
      });

      return sendSuccess(request, reply, {
        created: created.length,
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

      let query: FirebaseFirestore.Query = firestore
        .collection("attendance")
        .where("schoolId", "==", request.schoolId);

      if (classId) query = query.where("classId", "==", classId);
      if (sectionId) query = query.where("sectionId", "==", sectionId);
      if (fromDate) query = query.where("date", ">=", fromDate);
      if (toDate) query = query.where("date", "<=", toDate);

      const snapshot = await query.get();
      const records = snapshot.docs.map((d) => d.data());

      const stats = { total: records.length, present: 0, absent: 0, late: 0, excused: 0 };
      for (const r of records) {
        switch (r.status) {
          case "Present": stats.present++; break;
          case "Absent": stats.absent++; break;
          case "Late": stats.late++; break;
          case "Excused": stats.excused++; break;
        }
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

      let query: FirebaseFirestore.Query = firestore
        .collection("attendance")
        .where("schoolId", "==", request.schoolId)
        .where("studentId", "==", studentId);

      if (fromDate) query = query.where("date", ">=", fromDate);
      if (toDate) query = query.where("date", "<=", toDate);

      query = query.orderBy("date", "desc").limit(200);

      const snapshot = await query.get();
      const records = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Compute summary stats
      const total = records.length;
      const present = records.filter((r: any) => r.status === "Present").length;
      const absent = records.filter((r: any) => r.status === "Absent").length;
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      return sendSuccess(request, reply, {
        records,
        stats: { total, present, absent, percentage },
      });
    }
  );
}
