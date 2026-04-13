import { prisma } from "../lib/prisma";
import { createLogger } from "../utils/logger";
import { assertSchoolScope } from "../lib/tenant-scope";

const log = createLogger("audit");

type JsonMap = Record<string, unknown>;

export interface WriteAuditLogOptions {
  entity?: string;
  entityId?: string;
  // Backward-compatible aliases for older call sites.
  resource?: string;
  resourceId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  before?: JsonMap;
  after?: JsonMap;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferEntityFromAction(action: string): string | undefined {
  const normalized = action.trim().toUpperCase();
  if (!normalized.includes("_")) return undefined;

  const parts = normalized.split("_");
  const candidate = parts[parts.length - 1];
  if (!candidate || candidate === "ALL") return undefined;

  return candidate.toLowerCase();
}

function inferEntityIdFromMetadata(metadata: JsonMap): string | undefined {
  for (const [key, value] of Object.entries(metadata)) {
    if (!/id$/i.test(key)) continue;
    const parsed = asNonEmptyString(value);
    if (parsed) return parsed;
  }

  return undefined;
}

function normalizeAction(action: string): string {
  return action.trim().toUpperCase();
}

/**
 * Write an audit log entry to PostgreSQL.
 *
 * Fire-and-forget — errors are logged but never thrown so that
 * the primary operation is not affected.
 */
export async function writeAuditLog(
  action: string,
  userId: string,
  schoolId: string,
  metadata: JsonMap = {},
  options: WriteAuditLogOptions = {}
): Promise<void> {
  assertSchoolScope(schoolId);

  const normalizedAction = normalizeAction(action);
  const normalizedSchoolId = asNonEmptyString(schoolId);

  if (!normalizedAction || !normalizedSchoolId) {
    log.warn(
      { action, schoolId, userId },
      "Skipping audit log write due to invalid action/schoolId"
    );
    return;
  }

  const entity =
    asNonEmptyString(options.entity) ??
    asNonEmptyString(options.resource) ??
    inferEntityFromAction(normalizedAction);

  const entityId =
    asNonEmptyString(options.entityId) ??
    asNonEmptyString(options.resourceId) ??
    inferEntityIdFromMetadata(metadata);

  // Fire-and-forget by design: audit failures must never block business flows.
  void prisma.auditLog
    .create({
      data: {
        action: normalizedAction,
        schoolId: normalizedSchoolId,
        userId: asNonEmptyString(userId),
        entity,
        entityId,
        metadata:
          Object.keys(metadata).length > 0 ? (metadata as unknown as object) : undefined,
        requestId: asNonEmptyString(options.requestId),
        ipAddress: asNonEmptyString(options.ipAddress),
        userAgent: asNonEmptyString(options.userAgent),
        before: options.before ? (options.before as unknown as object) : undefined,
        after: options.after ? (options.after as unknown as object) : undefined,
      },
    })
    .catch((err: unknown) => {
      log.error(
        { err, action: normalizedAction, schoolId: normalizedSchoolId, userId },
        "Failed to write audit log"
      );
    });
}

/**
 * Query audit logs for a school.
 */
export async function getAuditLogs(
  schoolId: string,
  options: {
    from?: string;
    to?: string;
    action?: string;
    userId?: string;
    entity?: string;
    // Backward-compatible query alias.
    resource?: string;
    limit?: number;
    cursor?: string;
  } = {}
) {
  assertSchoolScope(schoolId);

  const where: Record<string, unknown> = { schoolId };

  if (options.action) where.action = options.action;
  if (options.userId) where.userId = options.userId;
  if (options.entity || options.resource) {
    where.entity = options.entity ?? options.resource;
  }
  if (options.from || options.to) {
    where.createdAt = {
      ...(options.from ? { gte: new Date(options.from) } : {}),
      ...(options.to ? { lte: new Date(options.to) } : {}),
    };
  }

  const limit = Math.min(options.limit ?? 50, 100);

  const logs = await prisma.auditLog.findMany({
    where: where as any,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > limit;
  const data = hasMore ? logs.slice(0, limit) : logs;

  return {
    data,
    pagination: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
      limit,
    },
  };
}
