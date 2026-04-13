/**
 * API key authentication for inter-service and machine-to-machine calls.
 *
 * Usage:
 *   - Keys are created in /api/v1/api-keys and stored hashed in PostgreSQL
 *   - Clients send the key in the `X-API-Key` header
 *   - Use `apiKeyAuth` as a preHandler to protect internal endpoints
 *
 * This is separate from Firebase Auth and is for server-to-server calls,
 * webhooks from third-party services (beyond Razorpay), or admin CLI tools.
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { setTenantContext } from "../lib/tenant-context";
import { authenticate, type UserRecord } from "./auth";
import { tenantGuard } from "./tenant";
import { roleMiddleware } from "./role";
import { enforceSubscription } from "./subscription";
import { Errors } from "../errors";
import { writeAuditLog } from "../services/audit.service";

interface ApiKeyEntry {
  id: string;
  schoolId: string;
  key: string;
  name: string;
  permissions: string[];
  rateLimit: number;
}

interface ApiKeyAuthOptions {
  requiredPermission?: string;
}

interface ApiKeyOrUserAuthOptions {
  requiredPermission: string;
  allowedRoles?: string[];
  requireSubscription?: boolean;
}

function hashApiKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function hasPermission(entry: ApiKeyEntry, requiredPermission?: string): boolean {
  if (!requiredPermission) return true;
  if (entry.permissions.includes("*")) return true;
  return entry.permissions.includes(requiredPermission);
}

export async function validateApiKey(key: string): Promise<ApiKeyEntry | null> {
  const keyHash = hashApiKey(key);
  const now = new Date();

  const record = await prisma.apiKey.findFirst({
    where: {
      keyHash,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
      permissions: true,
      rateLimit: true,
    },
  });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    schoolId: record.schoolId,
    key,
    name: record.name,
    permissions: record.permissions,
    rateLimit: record.rateLimit,
  };
}

/**
 * Fastify preHandler that requires a valid API key in the X-API-Key header.
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ApiKeyAuthOptions = {}
): Promise<void> {
  const apiKey = request.headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    return reply.status(401).send({
      success: false,
      error: {
        code: "API_KEY_MISSING",
        message: "X-API-Key header is required",
      },
    });
  }

  const entry = await validateApiKey(apiKey);

  if (!entry) {
    request.log.warn({ apiKey: apiKey.slice(0, 8) + "..." }, "Invalid API key attempt");
    return reply.status(403).send({
      success: false,
      error: {
        code: "API_KEY_INVALID",
        message: "Invalid API key",
      },
    });
  }

  if (!hasPermission(entry, options.requiredPermission)) {
    request.log.warn(
      {
        apiKeyName: entry.name,
        requiredPermission: options.requiredPermission,
      },
      "API key permission denied"
    );

    return reply.status(403).send({
      success: false,
      error: {
        code: "API_KEY_PERMISSION_DENIED",
        message: "API key does not have required permission",
      },
    });
  }

  setTenantContext({
    enforceTenant: true,
    schoolId: entry.schoolId,
  });

  const syntheticUser: UserRecord = {
    uid: `api-key:${entry.id}`,
    email: "",
    role: "Admin",
    displayName: entry.name,
    schoolId: entry.schoolId,
    isActive: true,
    authType: "api-key",
    apiKeyId: entry.id,
  };

  request.user = syntheticUser;
  request.schoolId = entry.schoolId;

  // Attach the API key info to the request for auditing
  request.apiKeyId = entry.id;
  request.apiKeyName = entry.name;

  const route = (request.routeOptions?.url ?? request.url).split("?")[0];
  const userAgentHeader = request.headers["user-agent"];
  const userAgent = Array.isArray(userAgentHeader)
    ? userAgentHeader[0]
    : userAgentHeader;

  void writeAuditLog(
    "API_KEY_USED",
    syntheticUser.uid,
    entry.schoolId,
    {
      keyId: entry.id,
      keyName: entry.name,
      route,
      method: request.method,
      schoolId: entry.schoolId,
      requiredPermission: options.requiredPermission,
    },
    {
      entity: "api_key",
      entityId: entry.id,
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent,
    }
  );

  void prisma.apiKey.update({
    where: { id: entry.id },
    data: { lastUsedAt: new Date() },
  }).catch((err) => {
    request.log.warn(
      { err, apiKeyName: entry.name },
      "Failed to update API key lastUsedAt"
    );
  });

  request.log.info({ apiKeyName: entry.name }, "API key authenticated");
}

function hasAuthorizationHeader(request: FastifyRequest): boolean {
  return request.headers.authorization !== undefined;
}

function hasApiKeyHeader(request: FastifyRequest): boolean {
  const value = request.headers["x-api-key"];
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }

  return typeof value === "string" && value.trim().length > 0;
}

export function apiKeyOrUserAuth(options: ApiKeyOrUserAuthOptions) {
  const roleGuard = options.allowedRoles
    ? roleMiddleware(options.allowedRoles)
    : undefined;

  return async function hybridAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (hasAuthorizationHeader(request)) {
      await authenticate(request, reply);
      await tenantGuard(request, reply);

      if (roleGuard) {
        await roleGuard(request, reply);
      }

      if (options.requireSubscription) {
        await enforceSubscription(request, reply);
      }

      return;
    }

    if (hasApiKeyHeader(request)) {
      await apiKeyAuth(request, reply, {
        requiredPermission: options.requiredPermission,
      });

      if (reply.sent) {
        return;
      }

      await tenantGuard(request, reply);

      if (roleGuard) {
        await roleGuard(request, reply);
      }

      if (options.requireSubscription) {
        await enforceSubscription(request, reply);
      }

      return;
    }

    throw Errors.tokenMissing();
  };
}

/**
 * Deprecated no-op retained for backwards compatibility in tests.
 */
export function resetApiKeyCache(): void {
  // Intentionally empty.
}
