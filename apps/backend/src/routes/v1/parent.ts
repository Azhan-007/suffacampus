/**
 * Parent Portal routes — read-only access for parents.
 *
 * All endpoints require authentication + Parent role.
 * Data is scoped to the parent's linked students only.
 *
 *  GET    /parent/children                         — summary cards for all linked students
 *  GET    /parent/children/:studentId/attendance    — attendance records
 *  GET    /parent/children/:studentId/fees          — fee records
 *  GET    /parent/children/:studentId/results       — exam results
 *  GET    /parent/events                            — upcoming school events
 *  POST   /parent/link                              — redeem invite code to link a child
 *
 * Admin endpoints (inside same plugin for cohesion):
 *  POST   /parent/invites                           — generate invite code for a student
 *  GET    /parent/invites                           — list active invites
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { tenantGuard } from "../../middleware/tenant.js";
import { roleMiddleware } from "../../middleware/role.js";
import { sendSuccess, sendPaginated } from "../../utils/response.js";
import { Errors } from "../../errors/index.js";
import { paginationSchema } from "../../utils/pagination.js";
import { z } from "zod";
import {
  createParentInvite,
  redeemParentInvite,
  getLinkedStudentIds,
  assertParentOwnsStudent,
  getChildrenSummaries,
  getStudentAttendanceForParent,
  getStudentFeesForParent,
  getStudentResultsForParent,
  getSchoolEventsForParent,
} from "../../services/parent.service.js";

export default async function parentRoutes(server: FastifyInstance) {
  const parentChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Parent", "Admin", "SuperAdmin"]),
  ];

  const adminChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "SuperAdmin", "Principal"]),
  ];

  // ===================================================================
  //  ADMIN: Generate invite code
  // ===================================================================

  const inviteSchema = z.object({
    studentId: z.string().min(1, "studentId is required"),
  });

  server.post(
    "/parent/invites",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) throw Errors.validation(parsed.error.format());

      const invite = await createParentInvite(
        request.schoolId,
        parsed.data.studentId,
        request.user.uid
      );

      return sendSuccess(request, reply, invite, 201);
    }
  );

  // ===================================================================
  //  ADMIN: List active invites
  // ===================================================================

  server.get(
    "/parent/invites",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { firestore } = await import("../../lib/firebase-admin.js");
      const snap = await firestore
        .collection("parentInvites")
        .where("schoolId", "==", request.schoolId)
        .where("isActive", "==", true)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      const invites = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => d.data());
      return sendSuccess(request, reply, invites);
    }
  );

  // ===================================================================
  //  PARENT: Redeem invite code
  // ===================================================================

  const linkSchema = z.object({
    code: z.string().min(1, "Invite code is required"),
  });

  server.post(
    "/parent/link",
    { preHandler: [authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = linkSchema.safeParse(request.body);
      if (!parsed.success) throw Errors.validation(parsed.error.format());

      const result = await redeemParentInvite(parsed.data.code, request.user.uid);

      // Refresh auth cache because role/school/studentIds may have changed.
      request.server.cache?.del("user", request.user.uid);

      return sendSuccess(request, reply, result);
    }
  );

  // ===================================================================
  //  PARENT: Children summaries
  // ===================================================================

  server.get(
    "/parent/children",
    { preHandler: parentChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const studentIds = getLinkedStudentIds(request.user);
      if (studentIds.length === 0) {
        return sendSuccess(request, reply, []);
      }

      const summaries = await getChildrenSummaries(request.schoolId, studentIds);
      return sendSuccess(request, reply, summaries);
    }
  );

  // ===================================================================
  //  PARENT: Child attendance
  // ===================================================================

  server.get<{ Params: { studentId: string }; Querystring: Record<string, string | undefined> }>(
    "/parent/children/:studentId/attendance",
    { preHandler: parentChain },
    async (request, reply) => {
      assertParentOwnsStudent(request.user, request.params.studentId);
      const pagination = paginationSchema.parse(request.query);

      const result = await getStudentAttendanceForParent(
        request.schoolId,
        request.params.studentId,
        pagination
      );

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // ===================================================================
  //  PARENT: Child fees
  // ===================================================================

  server.get<{ Params: { studentId: string }; Querystring: Record<string, string | undefined> }>(
    "/parent/children/:studentId/fees",
    { preHandler: parentChain },
    async (request, reply) => {
      assertParentOwnsStudent(request.user, request.params.studentId);
      const pagination = paginationSchema.parse(request.query);

      const result = await getStudentFeesForParent(
        request.schoolId,
        request.params.studentId,
        pagination
      );

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // ===================================================================
  //  PARENT: Child results
  // ===================================================================

  server.get<{ Params: { studentId: string }; Querystring: Record<string, string | undefined> }>(
    "/parent/children/:studentId/results",
    { preHandler: parentChain },
    async (request, reply) => {
      assertParentOwnsStudent(request.user, request.params.studentId);
      const pagination = paginationSchema.parse(request.query);

      const result = await getStudentResultsForParent(
        request.schoolId,
        request.params.studentId,
        pagination
      );

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // ===================================================================
  //  PARENT: School events
  // ===================================================================

  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/parent/events",
    { preHandler: parentChain },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);

      const result = await getSchoolEventsForParent(
        request.schoolId,
        pagination
      );

      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );
}
