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
import { sendError, sendSuccess } from "../../utils/response";

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
      const normalizedCategory = category as FileCategory;

      if (!VALID_CATEGORIES.includes(normalizedCategory)) {
        return sendError(
          request,
          reply,
          400,
          "INVALID_CATEGORY",
          `Invalid category. Valid: ${VALID_CATEGORIES.join(", ")}`
        );
      }

      let data: Awaited<ReturnType<typeof request.file>>;
      try {
        data = await request.file();
      } catch (error) {
        request.log.warn({ err: error }, "Failed to parse multipart upload");
        return sendError(
          request,
          reply,
          400,
          "INVALID_MULTIPART_PAYLOAD",
          "Invalid multipart upload payload"
        );
      }

      if (!data) {
        return sendError(
          request,
          reply,
          400,
          "NO_FILE",
          "No file provided in the request"
        );
      }

      let buffer: Buffer;
      try {
        buffer = await data.toBuffer();
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code?: string }).code)
            : undefined;

        if (code === "FST_REQ_FILE_TOO_LARGE") {
          return sendError(
            request,
            reply,
            413,
            "FILE_TOO_LARGE",
            "Uploaded file exceeds allowed size"
          );
        }

        request.log.warn({ err: error }, "Failed to buffer uploaded file");
        return sendError(
          request,
          reply,
          400,
          "INVALID_UPLOAD_STREAM",
          "Unable to read uploaded file"
        );
      }

      const contentType = data.mimetype as string;
      const originalName = data.filename as string;

      // Validate before upload
      const validation = validateFile(
        normalizedCategory,
        contentType,
        buffer.length,
        buffer
      );
      if (!validation.valid) {
        return sendError(
          request,
          reply,
          validation.error?.toLowerCase().includes("too large") ? 413 : 400,
          "FILE_VALIDATION_FAILED",
          validation.error ?? "Invalid upload"
        );
      }

      const result = await uploadFile({
        schoolId,
        category: normalizedCategory,
        originalName,
        buffer,
        contentType,
      });

      return reply.status(201).send({ url: result.publicUrl });
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
