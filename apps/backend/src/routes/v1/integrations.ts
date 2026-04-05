import crypto from "crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess } from "../../utils/response";
import { Errors } from "../../errors";

const adminChain = [authenticate, tenantGuard, roleMiddleware(["Admin", "SuperAdmin"])];

const createApiKeySchema = z.object({
  name: z.string().min(2).max(120),
  permissions: z.array(z.string().min(1)).default([]),
  rateLimit: z.number().int().positive().max(10_000).optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateApiKeySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  permissions: z.array(z.string().min(1)).optional(),
  rateLimit: z.number().int().positive().max(10_000).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
});

function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function buildRawApiKey(): { rawKey: string; prefix: string } {
  const prefix = "ek_live";
  const token = crypto.randomBytes(24).toString("hex");
  return {
    prefix,
    rawKey: `${prefix}_${token}`,
  };
}

export default async function integrationsRoutes(server: FastifyInstance) {
  // GET /api-keys
  server.get(
    "/api-keys",
    { preHandler: adminChain },
    async (request, reply) => {
      const keys = await prisma.apiKey.findMany({
        where: { schoolId: request.schoolId },
        orderBy: { createdAt: "desc" },
      });

      return sendSuccess(
        request,
        reply,
        keys.map((key) => ({
          id: key.id,
          schoolId: key.schoolId,
          name: key.name,
          prefix: key.prefix,
          status: key.status,
          permissions: key.permissions,
          rateLimit: key.rateLimit,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt,
        }))
      );
    }
  );

  // POST /api-keys
  server.post(
    "/api-keys",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply) => {
      const parsed = createApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const { rawKey, prefix } = buildRawApiKey();
      const created = await prisma.apiKey.create({
        data: {
          schoolId: request.schoolId,
          name: parsed.data.name,
          keyHash: hashApiKey(rawKey),
          prefix,
          status: "active",
          permissions: parsed.data.permissions,
          rateLimit: parsed.data.rateLimit ?? 60,
          expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        },
      });

      return sendSuccess(
        request,
        reply,
        {
          apiKey: {
            id: created.id,
            schoolId: created.schoolId,
            name: created.name,
            prefix: created.prefix,
            status: created.status,
            permissions: created.permissions,
            rateLimit: created.rateLimit,
            lastUsedAt: created.lastUsedAt,
            expiresAt: created.expiresAt,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          },
          rawKey,
        },
        201
      );
    }
  );

  // PATCH /api-keys/:id
  server.patch<{ Params: { id: string } }>(
    "/api-keys/:id",
    { preHandler: adminChain },
    async (request, reply) => {
      const parsed = updateApiKeySchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const existing = await prisma.apiKey.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
        },
      });
      if (!existing) {
        throw Errors.notFound("API key", request.params.id);
      }

      const updated = await prisma.apiKey.update({
        where: { id: existing.id },
        data: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.permissions ? { permissions: parsed.data.permissions } : {}),
          ...(parsed.data.rateLimit ? { rateLimit: parsed.data.rateLimit } : {}),
          ...(Object.prototype.hasOwnProperty.call(parsed.data, "expiresAt")
            ? {
                expiresAt: parsed.data.expiresAt
                  ? new Date(parsed.data.expiresAt)
                  : null,
              }
            : {}),
        },
      });

      return sendSuccess(request, reply, {
        id: updated.id,
        schoolId: updated.schoolId,
        name: updated.name,
        prefix: updated.prefix,
        status: updated.status,
        permissions: updated.permissions,
        rateLimit: updated.rateLimit,
        lastUsedAt: updated.lastUsedAt,
        expiresAt: updated.expiresAt,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    }
  );

  // DELETE /api-keys/:id
  server.delete<{ Params: { id: string } }>(
    "/api-keys/:id",
    { preHandler: adminChain },
    async (request, reply) => {
      const existing = await prisma.apiKey.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
        },
      });
      if (!existing) {
        throw Errors.notFound("API key", request.params.id);
      }

      await prisma.apiKey.update({
        where: { id: existing.id },
        data: { status: "revoked" },
      });

      return sendSuccess(request, reply, { revoked: true });
    }
  );

  // GET /api-keys/usage
  server.get(
    "/api-keys/usage",
    { preHandler: adminChain },
    async (request, reply) => {
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const records = await prisma.usageRecord.findMany({
        where: {
          schoolId: request.schoolId,
          date: { gte: from },
        },
        select: { apiCalls: true },
      });

      const totalCalls = records.reduce((sum, row) => sum + (row.apiCalls ?? 0), 0);

      return sendSuccess(request, reply, {
        totalCalls,
        periodDays: 30,
        averagePerDay: records.length > 0 ? Math.round(totalCalls / records.length) : 0,
      });
    }
  );

  // GET /webhooks
  server.get(
    "/webhooks",
    { preHandler: adminChain },
    async (request, reply) => {
      const webhooks = await prisma.webhookConfig.findMany({
        where: { schoolId: request.schoolId },
        orderBy: { createdAt: "desc" },
      });

      return sendSuccess(request, reply, webhooks);
    }
  );

  // POST /webhooks
  server.post(
    "/webhooks",
    { preHandler: adminChain },
    async (request: FastifyRequest, reply) => {
      const parsed = createWebhookSchema.safeParse(request.body);
      if (!parsed.success) {
        throw Errors.validation(parsed.error.flatten().fieldErrors);
      }

      const created = await prisma.webhookConfig.create({
        data: {
          schoolId: request.schoolId,
          url: parsed.data.url,
          events: parsed.data.events,
          secret: crypto.randomBytes(24).toString("hex"),
        },
      });

      return sendSuccess(request, reply, created, 201);
    }
  );

  // DELETE /webhooks/:id
  server.delete<{ Params: { id: string } }>(
    "/webhooks/:id",
    { preHandler: adminChain },
    async (request, reply) => {
      const webhook = await prisma.webhookConfig.findFirst({
        where: {
          id: request.params.id,
          schoolId: request.schoolId,
        },
      });
      if (!webhook) {
        throw Errors.notFound("Webhook", request.params.id);
      }

      await prisma.webhookConfig.delete({ where: { id: webhook.id } });
      return sendSuccess(request, reply, { deleted: true });
    }
  );

  // GET /webhooks/deliveries
  server.get<{ Querystring: { webhookId?: string; status?: string; limit?: string; offset?: string } }>(
    "/webhooks/deliveries",
    { preHandler: adminChain },
    async (request, reply) => {
      const limit = Math.min(Math.max(parseInt(request.query.limit ?? "20", 10) || 20, 1), 200);
      const offset = Math.max(parseInt(request.query.offset ?? "0", 10) || 0, 0);

      const where = {
        schoolId: request.schoolId,
        ...(request.query.webhookId ? { webhookId: request.query.webhookId } : {}),
        ...(request.query.status ? { status: request.query.status } : {}),
      };

      const [deliveries, total] = await Promise.all([
        prisma.webhookDelivery.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        prisma.webhookDelivery.count({ where }),
      ]);

      return sendSuccess(request, reply, { deliveries, total });
    }
  );

  // GET /webhooks/deliveries/:deliveryId
  server.get<{ Params: { deliveryId: string } }>(
    "/webhooks/deliveries/:deliveryId",
    { preHandler: adminChain },
    async (request, reply) => {
      const delivery = await prisma.webhookDelivery.findFirst({
        where: {
          id: request.params.deliveryId,
          schoolId: request.schoolId,
        },
      });
      if (!delivery) {
        throw Errors.notFound("Webhook delivery", request.params.deliveryId);
      }

      return sendSuccess(request, reply, delivery);
    }
  );

  // POST /webhooks/deliveries/:deliveryId/retry
  server.post<{ Params: { deliveryId: string } }>(
    "/webhooks/deliveries/:deliveryId/retry",
    { preHandler: adminChain },
    async (request, reply) => {
      const delivery = await prisma.webhookDelivery.findFirst({
        where: {
          id: request.params.deliveryId,
          schoolId: request.schoolId,
        },
      });
      if (!delivery) {
        throw Errors.notFound("Webhook delivery", request.params.deliveryId);
      }

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "retrying",
          attempt: delivery.attempt + 1,
          nextRetryAt: new Date(Date.now() + 60_000),
        },
      });

      return sendSuccess(request, reply, { queued: true });
    }
  );
}
