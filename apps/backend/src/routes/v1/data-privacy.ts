import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";

const authChain = [authenticate, tenantGuard, roleMiddleware(["Admin", "SuperAdmin"])];

const createDataRequestSchema = z.object({
  type: z.enum(["export", "deletion"]),
  scope: z.array(z.string().min(1)).min(1),
  reason: z.string().max(500).optional(),
}).strict();

const updatePrivacySettingsSchema = z.object({
  dataRetentionDays: z.number().int().positive().optional(),
  anonymizeInactiveAfterDays: z.number().int().positive().optional(),
  autoDeleteBackupsAfterDays: z.number().int().positive().optional(),
  consentRequired: z.boolean().optional(),
  cookieBannerEnabled: z.boolean().optional(),
}).strict();

const DEFAULT_PRIVACY_SETTINGS = {
  dataRetentionDays: 365,
  anonymizeInactiveAfterDays: 730,
  autoDeleteBackupsAfterDays: 90,
  consentRequired: false,
  cookieBannerEnabled: false,
};

export default async function dataPrivacyRoutes(server: FastifyInstance) {
  // GET /data-privacy/requests
  server.get(
    "/data-privacy/requests",
    { preHandler: authChain },
    async (request, reply) => {
      const requests = await prisma.dataRequest.findMany({
        where: { schoolId: request.schoolId },
        orderBy: { createdAt: "desc" },
      });

      return sendSuccess(request, reply, requests);
    }
  );

  // POST /data-privacy/requests
  server.post(
    "/data-privacy/requests",
    { preHandler: authChain },
    async (request: FastifyRequest, reply) => {
      const parsed = createDataRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const created = await prisma.dataRequest.create({
        data: {
          schoolId: request.schoolId,
          requestedBy: request.user.uid,
          requestedByName: request.user.displayName ?? request.user.name ?? request.user.email,
          type: parsed.data.type,
          scope: parsed.data.scope,
          reason: parsed.data.reason,
        },
      });

      return sendSuccess(request, reply, created, 201);
    }
  );

  // GET /data-privacy/settings
  server.get(
    "/data-privacy/settings",
    { preHandler: authChain },
    async (request, reply) => {
      const config = await prisma.schoolConfig.findUnique({
        where: { schoolId: request.schoolId },
        select: { metadata: true },
      });

      const metadata = (config?.metadata ?? {}) as Record<string, unknown>;
      const settings = (metadata.privacySettings as Record<string, unknown> | undefined) ?? {};

      return sendSuccess(request, reply, {
        ...DEFAULT_PRIVACY_SETTINGS,
        ...settings,
      });
    }
  );

  // PATCH /data-privacy/settings
  server.patch(
    "/data-privacy/settings",
    { preHandler: authChain },
    async (request, reply) => {
      const parsed = updatePrivacySettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const config = await prisma.schoolConfig.findUnique({
        where: { schoolId: request.schoolId },
        select: { metadata: true },
      });

      const metadata = ((config?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      const currentSettings = (metadata.privacySettings as Record<string, unknown> | undefined) ?? DEFAULT_PRIVACY_SETTINGS;
      const nextSettings = {
        ...currentSettings,
        ...parsed.data,
      };

      await prisma.schoolConfig.upsert({
        where: { schoolId: request.schoolId },
        update: {
          metadata: {
            ...metadata,
            privacySettings: nextSettings,
          },
        },
        create: {
          schoolId: request.schoolId,
          metadata: {
            privacySettings: nextSettings,
          },
        },
      });

      return sendSuccess(request, reply, { updated: true });
    }
  );

  // GET /data-privacy/requests/:requestId/download
  server.get<{ Params: { requestId: string } }>(
    "/data-privacy/requests/:requestId/download",
    { preHandler: authChain },
    async (request, reply) => {
      const dataRequest = await prisma.dataRequest.findFirst({
        where: {
          id: request.params.requestId,
          schoolId: request.schoolId,
        },
        select: {
          downloadUrl: true,
          status: true,
        },
      });

      if (!dataRequest) {
        throw Errors.notFound("Data request", request.params.requestId);
      }

      if (!dataRequest.downloadUrl) {
        throw Errors.badRequest(
          dataRequest.status === "completed"
            ? "Download URL is unavailable"
            : "Export is not ready yet"
        );
      }

      return sendSuccess(request, reply, { downloadUrl: dataRequest.downloadUrl });
    }
  );
}
