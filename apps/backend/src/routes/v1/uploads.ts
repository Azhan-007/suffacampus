import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { enforceSubscription } from "../../middleware/subscription";
import {
  uploadFile,
  deleteFile,
  listFiles,
  getStorageUsage,
  getSignedUrl,
  validateFile,
} from "../../services/storage.service";
import { sendSuccess } from "../../utils/response";

type FileCategory = "photos" | "documents" | "reports" | "receipts" | "imports";
const VALID_CATEGORIES: FileCategory[] = [
  "photos",
  "documents",
  "reports",
  "receipts",
  "imports",
];

export default async function uploadRoutes(server: FastifyInstance) {
  const authChain = [
    authenticate,
    tenantGuard,
    roleMiddleware(["Admin", "Teacher", "SuperAdmin"]),
    enforceSubscription,
  ];

  // Register multipart parser for this plugin scope
  // Requires @fastify/multipart (will gracefully fail if not installed)

  // -----------------------------------------------------------------------
  // POST /uploads/:category — upload a file
  //   Body: multipart/form-data with a "file" field
  //   Params: category (photos, documents, reports, receipts, imports)
  // -----------------------------------------------------------------------
  server.post<{ Params: { category: string } }>(
    "/uploads/:category",
    { preHandler: authChain },
    async (request, reply) => {
      const { category } = request.params;
      const schoolId = request.schoolId as string;

      if (!VALID_CATEGORIES.includes(category as FileCategory)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "INVALID_CATEGORY",
            message: `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`,
          },
        });
      }

      // Handle multipart upload
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "NO_FILE",
            message: "No file provided in the request",
          },
        });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }
      const buffer = Buffer.concat(chunks);

      const contentType = data.mimetype as string;
      const originalName = data.filename as string;

      // Validate before upload
      const validation = validateFile(
        category as FileCategory,
        contentType,
        buffer.length
      );
      if (!validation.valid) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "FILE_VALIDATION_FAILED",
            message: validation.error,
          },
        });
      }

      const result = await uploadFile({
        schoolId,
        category: category as FileCategory,
        originalName,
        buffer,
        contentType,
      });

      return sendSuccess(request, reply, result, 201);
    }
  );

  // -----------------------------------------------------------------------
  // GET /uploads/:category — list files in a category
  // -----------------------------------------------------------------------
  server.get<{ Params: { category: string } }>(
    "/uploads/:category",
    { preHandler: authChain },
    async (request, reply) => {
      const { category } = request.params;
      const schoolId = request.schoolId as string;

      if (!VALID_CATEGORIES.includes(category as FileCategory)) {
        return reply.status(400).send({
          success: false,
          error: { code: "INVALID_CATEGORY", message: "Invalid category" },
        });
      }

      const files = await listFiles(schoolId, category as FileCategory);

      return sendSuccess(request, reply, { files, count: files.length });
    }
  );

  // -----------------------------------------------------------------------
  // GET /uploads/usage — get total storage usage for the school
  // -----------------------------------------------------------------------
  server.get(
    "/uploads/usage",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const usageBytes = await getStorageUsage(schoolId);

      return sendSuccess(request, reply, {
        usageBytes,
        usageMB: Math.round((usageBytes / 1024 / 1024) * 100) / 100,
        usageGB: Math.round((usageBytes / 1024 / 1024 / 1024) * 1000) / 1000,
      });
    }
  );

  // -----------------------------------------------------------------------
  // POST /uploads/signed-url — get a signed download URL
  //   Body: { storagePath: string, expiresInMinutes?: number }
  // -----------------------------------------------------------------------
  server.post(
    "/uploads/signed-url",
    { preHandler: authChain },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const body = request.body as {
        storagePath?: string;
        expiresInMinutes?: number;
      };

      if (!body?.storagePath) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_PATH",
            message: "storagePath is required",
          },
        });
      }

      // Tenant isolation: ensure the path starts with the school's prefix
      if (!body.storagePath.startsWith(`${schoolId}/`)) {
        return reply.status(403).send({
          success: false,
          error: {
            code: "ACCESS_DENIED",
            message: "Cannot access files from another school",
          },
        });
      }

      const url = await getSignedUrl(
        body.storagePath,
        body.expiresInMinutes ?? 60
      );

      return sendSuccess(request, reply, { url, expiresInMinutes: body.expiresInMinutes ?? 60 });
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /uploads — delete a file
  //   Body: { storagePath: string }
  // -----------------------------------------------------------------------
  server.delete(
    "/uploads",
    { preHandler: [...authChain.slice(0, 3), roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const schoolId = request.schoolId as string;
      const body = request.body as { storagePath?: string };

      if (!body?.storagePath) {
        return reply.status(400).send({
          success: false,
          error: {
            code: "MISSING_PATH",
            message: "storagePath is required",
          },
        });
      }

      // Tenant isolation
      if (!body.storagePath.startsWith(`${schoolId}/`)) {
        return reply.status(403).send({
          success: false,
          error: {
            code: "ACCESS_DENIED",
            message: "Cannot delete files from another school",
          },
        });
      }

      await deleteFile(body.storagePath);

      return sendSuccess(request, reply, { deleted: true });
    }
  );
}
