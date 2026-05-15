import crypto from "crypto";
import { Prisma, type TenantAccessStatus, type TenantLifecycleState } from "@prisma/client";
import { prisma, type PrismaTransactionClient } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { assertSchoolScope } from "../lib/tenant-scope";
import { createLogger } from "../utils/logger";

const log = createLogger("tenant-lifecycle");
const GRACE_PERIOD_DAYS = 7;
let accessStateTableAvailable: boolean | null = null;

export type TenantAccessSnapshot = {
  id?: string;
  schoolId: string;
  accessState: TenantAccessStatus;
  lifecycleState: TenantLifecycleState;
  reason?: string | null;
  effectiveUntil?: Date | null;
  sourceSubscriptionId?: string | null;
  accessVersion: number;
  version: number;
  lastTransitionAt?: Date | null;
  exists: boolean;
};

export type TransitionOutcome = {
  status: "applied" | "noop" | "conflict" | "invalid" | "missing";
  transitionId: string;
  previous: TenantAccessSnapshot | null;
  current: TenantAccessSnapshot | null;
};

export type TransitionOptions = {
  schoolId: string;
  targetLifecycle: TenantLifecycleState;
  accessState?: TenantAccessStatus;
  reason?: string;
  effectiveUntil?: Date | null;
  sourceSubscriptionId?: string | null;
  performedBy?: string;
  source?: string;
  transitionId?: string;
  bumpAccessVersion?: boolean;
  schoolUpdate?: Record<string, unknown>;
  useTransaction?: PrismaTransactionClient;
  allowNoop?: boolean;
};

type PrismaClientLike = PrismaTransactionClient | typeof prisma;

type SchoolAccessFallback = {
  subscriptionStatus: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
  cancelEffectiveDate: Date | null;
  isActive: boolean | null;
};

const VALID_LIFECYCLE_TRANSITIONS: Record<TenantLifecycleState, TenantLifecycleState[]> = {
  trial: ["active", "expired", "cancelled", "suspended"],
  active: ["past_due", "cancelled", "expired", "suspended"],
  past_due: ["active", "expired", "suspended", "cancelled"],
  expired: ["active", "suspended"],
  cancelled: ["active", "expired", "suspended"],
  suspended: ["active", "expired", "cancelled"],
};

const SCHOOL_SYNC_FIELDS = new Set([
  "subscriptionPlan",
  "subscriptionStartDate",
  "subscriptionEndDate",
  "trialEndDate",
  "autoRenew",
  "currentPeriodStart",
  "currentPeriodEnd",
  "paymentFailureCount",
  "cancelledAt",
  "cancelEffectiveDate",
  "lastPaymentId",
  "pendingDowngrade",
]);

function pickPrismaClient(tx?: PrismaTransactionClient): PrismaClientLike {
  return tx ?? prisma;
}

function isSchemaCompatibilityError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function markAccessStateUnavailable(error: unknown): void {
  if (isSchemaCompatibilityError(error)) {
    accessStateTableAvailable = false;
  }
}

export function resetTenantAccessCompatibilityCache(): void {
  accessStateTableAvailable = null;
}

function buildTransitionId(): string {
  return crypto.randomUUID();
}

function addGracePeriod(date: Date): Date {
  return new Date(date.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

function normalizeAccessState(state?: TenantAccessStatus | null): TenantAccessStatus {
  return state ?? "active";
}

function defaultAccessStateForLifecycle(lifecycle: TenantLifecycleState): TenantAccessStatus {
  if (lifecycle === "expired" || lifecycle === "cancelled" || lifecycle === "suspended") {
    return "blocked";
  }
  return "active";
}

function normalizeEffectiveUntil(value?: Date | null): Date | null {
  if (!value) return null;
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

function sameDate(left?: Date | null, right?: Date | null): boolean {
  const leftTime = left ? left.getTime() : null;
  const rightTime = right ? right.getTime() : null;
  return leftTime === rightTime;
}

function mapLifecycleFromSchool(school: SchoolAccessFallback): {
  lifecycle: TenantLifecycleState;
  access: TenantAccessStatus;
  effectiveUntil: Date | null;
} {
  if (school.isActive === false) {
    return {
      lifecycle: "suspended",
      access: "blocked",
      effectiveUntil: null,
    };
  }

  const status = (school.subscriptionStatus ?? "trial").toString().toLowerCase();
  const lifecycle: TenantLifecycleState = ((): TenantLifecycleState => {
    if (status === "active") return "active";
    if (status === "past_due") return "past_due";
    if (status === "expired") return "expired";
    if (status === "cancelled") return "cancelled";
    return "trial";
  })();

  const access = defaultAccessStateForLifecycle(lifecycle);

  let effectiveUntil: Date | null = null;
  if (lifecycle === "trial" && school.trialEndDate) {
    effectiveUntil = school.trialEndDate;
  } else if (lifecycle === "past_due" && school.currentPeriodEnd) {
    effectiveUntil = addGracePeriod(school.currentPeriodEnd);
  } else if (lifecycle === "active" && school.currentPeriodEnd) {
    effectiveUntil = addGracePeriod(school.currentPeriodEnd);
  } else if (lifecycle === "cancelled" && school.cancelEffectiveDate) {
    effectiveUntil = school.cancelEffectiveDate;
  }

  if (lifecycle === "cancelled" && effectiveUntil) {
    const now = new Date();
    if (effectiveUntil.getTime() > now.getTime()) {
      return { lifecycle, access: "active", effectiveUntil };
    }
  }

  return { lifecycle, access, effectiveUntil };
}

export function deriveTenantAccessSeed(input: {
  subscriptionStatus?: string | null;
  trialEndDate?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelEffectiveDate?: Date | null;
  isActive?: boolean | null;
}): {
  lifecycleState: TenantLifecycleState;
  accessState: TenantAccessStatus;
  effectiveUntil: Date | null;
} {
  const derived = mapLifecycleFromSchool({
    subscriptionStatus: input.subscriptionStatus ?? null,
    trialEndDate: input.trialEndDate ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelEffectiveDate: input.cancelEffectiveDate ?? null,
    isActive: input.isActive ?? null,
  });

  return {
    lifecycleState: derived.lifecycle,
    accessState: derived.access,
    effectiveUntil: derived.effectiveUntil,
  };
}

export function isTenantAccessStateAvailable(): boolean {
  return accessStateTableAvailable !== false;
}

function sanitizeSchoolUpdate(input?: Record<string, unknown>): Record<string, unknown> {
  if (!input) return {};
  const safe: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (SCHOOL_SYNC_FIELDS.has(key)) {
      safe[key] = input[key];
    }
  }
  return safe;
}

async function applySchoolPatch(
  client: PrismaClientLike,
  schoolId: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  const schoolDelegate = (client as { school?: { updateMany?: unknown; update?: unknown } }).school;
  if (!schoolDelegate) return;

  if (typeof schoolDelegate.updateMany === "function") {
    await schoolDelegate.updateMany({
      where: { id: schoolId },
      data: patch,
    });
    return;
  }

  if (typeof schoolDelegate.update === "function") {
    await schoolDelegate.update({
      where: { id: schoolId },
      data: patch,
    });
  }
}

function shouldSetActiveFlag(
  previousLifecycle: TenantLifecycleState,
  nextLifecycle: TenantLifecycleState
): boolean {
  if (nextLifecycle === "suspended") return true;
  return previousLifecycle === "suspended";
}

function buildSchoolLifecyclePatch(
  previousLifecycle: TenantLifecycleState,
  nextLifecycle: TenantLifecycleState,
  accessState: TenantAccessStatus,
  schoolUpdate?: Record<string, unknown>
): Record<string, unknown> {
  const patch = sanitizeSchoolUpdate(schoolUpdate);

  if (nextLifecycle !== "suspended") {
    patch.subscriptionStatus = nextLifecycle;
  }

  if (shouldSetActiveFlag(previousLifecycle, nextLifecycle)) {
    patch.isActive = nextLifecycle !== "suspended";
  }

  if (accessState === "blocked" && nextLifecycle === "suspended") {
    patch.isActive = false;
  }

  return patch;
}

async function resolveSchoolFallback(
  schoolId: string,
  client: PrismaClientLike
): Promise<SchoolAccessFallback | null> {
  const schoolDelegate = (client as { school?: { findUnique?: unknown } }).school;
  if (!schoolDelegate || typeof schoolDelegate.findUnique !== "function") {
    return null;
  }

  const school = await client.school.findUnique({
    where: { id: schoolId },
    select: {
      subscriptionStatus: true,
      trialEndDate: true,
      currentPeriodEnd: true,
      cancelEffectiveDate: true,
      isActive: true,
    },
  });

  if (!school) return null;

  return {
    subscriptionStatus: school.subscriptionStatus ?? null,
    trialEndDate: school.trialEndDate ?? null,
    currentPeriodEnd: school.currentPeriodEnd ?? null,
    cancelEffectiveDate: school.cancelEffectiveDate ?? null,
    isActive: school.isActive ?? null,
  };
}

export async function resolveTenantAccessState(
  schoolId: string,
  options: { useTransaction?: PrismaTransactionClient } = {}
): Promise<TenantAccessSnapshot | null> {
  assertSchoolScope(schoolId);

  const client = pickPrismaClient(options.useTransaction);

  const delegate = (client as { tenantAccessState?: { findUnique?: unknown } }).tenantAccessState;
  if (!delegate || typeof delegate.findUnique !== "function") {
    accessStateTableAvailable = false;
  }

  let accessState: {
    id: string;
    schoolId: string;
    accessState: TenantAccessStatus;
    lifecycleState: TenantLifecycleState;
    reason: string | null;
    effectiveUntil: Date | null;
    sourceSubscriptionId: string | null;
    accessVersion: number;
    version: number;
    lastTransitionAt: Date | null;
  } | null = null;

  if (accessStateTableAvailable !== false) {
    try {
      accessState = await client.tenantAccessState.findUnique({
        where: { schoolId },
      });
      accessStateTableAvailable = true;
    } catch (error) {
      markAccessStateUnavailable(error);
      if (!isSchemaCompatibilityError(error)) {
        throw error;
      }
    }
  }

  if (accessState) {
    return {
      id: accessState.id,
      schoolId: accessState.schoolId,
      accessState: accessState.accessState,
      lifecycleState: accessState.lifecycleState,
      reason: accessState.reason ?? null,
      effectiveUntil: accessState.effectiveUntil ?? null,
      sourceSubscriptionId: accessState.sourceSubscriptionId ?? null,
      accessVersion: accessState.accessVersion ?? 0,
      version: accessState.version ?? 0,
      lastTransitionAt: accessState.lastTransitionAt ?? null,
      exists: true,
    };
  }

  const fallback = await resolveSchoolFallback(schoolId, client);
  if (!fallback) return null;

  const derived = mapLifecycleFromSchool(fallback);
  return {
    schoolId,
    accessState: derived.access,
    lifecycleState: derived.lifecycle,
    reason: "compatibility_fallback",
    effectiveUntil: derived.effectiveUntil,
    sourceSubscriptionId: null,
    accessVersion: 0,
    version: 0,
    lastTransitionAt: null,
    exists: false,
  };
}

export async function createTenantAccessState(params: {
  schoolId: string;
  lifecycleState: TenantLifecycleState;
  accessState?: TenantAccessStatus;
  reason?: string;
  effectiveUntil?: Date | null;
  sourceSubscriptionId?: string | null;
  performedBy?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TenantAccessSnapshot | null> {
  assertSchoolScope(params.schoolId);

  const client = pickPrismaClient(params.useTransaction);
  const now = new Date();

  const accessState = normalizeAccessState(
    params.accessState ?? defaultAccessStateForLifecycle(params.lifecycleState)
  );

  try {
    const createDelegate = (client as { tenantAccessState?: { create?: unknown } }).tenantAccessState;
    if (!createDelegate || typeof createDelegate.create !== "function") {
      accessStateTableAvailable = false;
      return null;
    }

    if (accessStateTableAvailable === false) {
      return null;
    }

    const created = await client.tenantAccessState.create({
      data: {
        schoolId: params.schoolId,
        accessState,
        lifecycleState: params.lifecycleState,
        reason: params.reason ?? "bootstrap",
        effectiveUntil: normalizeEffectiveUntil(params.effectiveUntil),
        sourceSubscriptionId: params.sourceSubscriptionId ?? null,
        accessVersion: 0,
        version: 1,
        lastTransitionAt: now,
      },
    });

    void writeAuditLog("TENANT_LIFECYCLE_BOOTSTRAP", params.performedBy ?? "system", params.schoolId, {
      lifecycleState: params.lifecycleState,
      accessState,
      reason: params.reason ?? "bootstrap",
      source: params.source ?? "bootstrap",
    });

    return {
      id: created.id,
      schoolId: created.schoolId,
      accessState: created.accessState,
      lifecycleState: created.lifecycleState,
      reason: created.reason ?? null,
      effectiveUntil: created.effectiveUntil ?? null,
      sourceSubscriptionId: created.sourceSubscriptionId ?? null,
      accessVersion: created.accessVersion ?? 0,
      version: created.version ?? 0,
      lastTransitionAt: created.lastTransitionAt ?? null,
      exists: true,
    };
  } catch (error) {
    markAccessStateUnavailable(error);
    log.warn({ err: error, schoolId: params.schoolId }, "Failed to create tenant access state");
    return null;
  }
}

export async function transitionTenantLifecycle(
  options: TransitionOptions
): Promise<TransitionOutcome> {
  assertSchoolScope(options.schoolId);

  const client = pickPrismaClient(options.useTransaction);
  const now = new Date();
  const transitionId = options.transitionId ?? buildTransitionId();

  const current = await resolveTenantAccessState(options.schoolId, {
    useTransaction: options.useTransaction,
  });

  if (!current) {
    return {
      status: "missing",
      transitionId,
      previous: null,
      current: null,
    };
  }

  const currentLifecycle = current.lifecycleState;
  const targetLifecycle = options.targetLifecycle;
  const allowed = VALID_LIFECYCLE_TRANSITIONS[currentLifecycle] ?? [];
  if (!allowed.includes(targetLifecycle) && currentLifecycle !== targetLifecycle) {
    log.warn(
      { schoolId: options.schoolId, currentLifecycle, targetLifecycle },
      "Invalid tenant lifecycle transition"
    );
    return {
      status: "invalid",
      transitionId,
      previous: current,
      current,
    };
  }

  const nextAccessState = options.accessState ?? defaultAccessStateForLifecycle(targetLifecycle);
  let effectiveUntil = normalizeEffectiveUntil(options.effectiveUntil);

  if (!effectiveUntil) {
    const inferredFromUpdate = options.schoolUpdate;
    if (targetLifecycle === "trial" && inferredFromUpdate?.trialEndDate instanceof Date) {
      effectiveUntil = inferredFromUpdate.trialEndDate as Date;
    } else if (targetLifecycle === "past_due" && inferredFromUpdate?.currentPeriodEnd instanceof Date) {
      effectiveUntil = addGracePeriod(inferredFromUpdate.currentPeriodEnd as Date);
    } else if (targetLifecycle === "active" && inferredFromUpdate?.currentPeriodEnd instanceof Date) {
      effectiveUntil = addGracePeriod(inferredFromUpdate.currentPeriodEnd as Date);
    } else if (targetLifecycle === "cancelled" && inferredFromUpdate?.cancelEffectiveDate instanceof Date) {
      effectiveUntil = inferredFromUpdate.cancelEffectiveDate as Date;
    }
  }

  const bumpAccessVersion = options.bumpAccessVersion ?? false;

  if (
    options.allowNoop !== false &&
    current.exists &&
    current.lifecycleState === targetLifecycle &&
    current.accessState === nextAccessState &&
    sameDate(current.effectiveUntil, effectiveUntil) &&
    !bumpAccessVersion
  ) {
    return {
      status: "noop",
      transitionId,
      previous: current,
      current,
    };
  }

  const nextAccessVersion = current.accessVersion + (bumpAccessVersion ? 1 : 0);
  const nextVersion = current.version + 1;

  const updateDelegate = (client as { tenantAccessState?: { updateMany?: unknown; create?: unknown } }).tenantAccessState;
  if (
    !updateDelegate ||
    typeof updateDelegate.updateMany !== "function" ||
    typeof updateDelegate.create !== "function"
  ) {
    accessStateTableAvailable = false;
  }

  if (accessStateTableAvailable === false) {
    const schoolPatch = buildSchoolLifecyclePatch(
      currentLifecycle,
      targetLifecycle,
      nextAccessState,
      options.schoolUpdate
    );

    await applySchoolPatch(client, options.schoolId, schoolPatch);

    void writeAuditLog("TENANT_LIFECYCLE_TRANSITION", options.performedBy ?? "system", options.schoolId, {
      transitionId,
      fromLifecycle: current.lifecycleState,
      toLifecycle: targetLifecycle,
      fromAccess: current.accessState,
      toAccess: nextAccessState,
      reason: options.reason ?? null,
      source: options.source ?? "unknown",
      version: nextVersion,
      accessVersion: nextAccessVersion,
      compatibility: "school_only",
    });

    return {
      status: "applied",
      transitionId,
      previous: current,
      current: {
        ...current,
        lifecycleState: targetLifecycle,
        accessState: nextAccessState,
        effectiveUntil: effectiveUntil ?? null,
        accessVersion: nextAccessVersion,
        version: nextVersion,
        lastTransitionAt: now,
        exists: false,
      },
    };
  }

  if (!current.exists) {
    const created = await client.tenantAccessState.create({
      data: {
        schoolId: options.schoolId,
        accessState: nextAccessState,
        lifecycleState: targetLifecycle,
        reason: options.reason ?? null,
        effectiveUntil: effectiveUntil ?? null,
        sourceSubscriptionId: options.sourceSubscriptionId ?? null,
        accessVersion: nextAccessVersion,
        version: 1,
        lastTransitionAt: now,
      },
    });

    if (options.schoolUpdate || targetLifecycle !== currentLifecycle) {
      const schoolPatch = buildSchoolLifecyclePatch(
        currentLifecycle,
        targetLifecycle,
        nextAccessState,
        options.schoolUpdate
      );
      await applySchoolPatch(client, options.schoolId, schoolPatch);
    }

    void writeAuditLog("TENANT_LIFECYCLE_TRANSITION", options.performedBy ?? "system", options.schoolId, {
      transitionId,
      fromLifecycle: current.lifecycleState,
      toLifecycle: targetLifecycle,
      fromAccess: current.accessState,
      toAccess: nextAccessState,
      reason: options.reason ?? null,
      source: options.source ?? "unknown",
      version: created.version,
      accessVersion: created.accessVersion,
    });

    return {
      status: "applied",
      transitionId,
      previous: current,
      current: {
        id: created.id,
        schoolId: created.schoolId,
        accessState: created.accessState,
        lifecycleState: created.lifecycleState,
        reason: created.reason ?? null,
        effectiveUntil: created.effectiveUntil ?? null,
        sourceSubscriptionId: created.sourceSubscriptionId ?? null,
        accessVersion: created.accessVersion ?? 0,
        version: created.version ?? 0,
        lastTransitionAt: created.lastTransitionAt ?? null,
        exists: true,
      },
    };
  }

  const updateResult = await client.tenantAccessState.updateMany({
    where: {
      id: current.id,
      version: current.version,
    },
    data: {
      accessState: nextAccessState,
      lifecycleState: targetLifecycle,
      reason: options.reason ?? null,
      effectiveUntil: effectiveUntil ?? null,
      sourceSubscriptionId: options.sourceSubscriptionId ?? null,
      accessVersion: nextAccessVersion,
      version: nextVersion,
      lastTransitionAt: now,
    },
  });

  if (updateResult.count === 0) {
    return {
      status: "conflict",
      transitionId,
      previous: current,
      current,
    };
  }

  if (options.schoolUpdate || targetLifecycle !== currentLifecycle) {
    const schoolPatch = buildSchoolLifecyclePatch(
      currentLifecycle,
      targetLifecycle,
      nextAccessState,
      options.schoolUpdate
    );
    await applySchoolPatch(client, options.schoolId, schoolPatch);
  }

  void writeAuditLog("TENANT_LIFECYCLE_TRANSITION", options.performedBy ?? "system", options.schoolId, {
    transitionId,
    fromLifecycle: current.lifecycleState,
    toLifecycle: targetLifecycle,
    fromAccess: current.accessState,
    toAccess: nextAccessState,
    reason: options.reason ?? null,
    source: options.source ?? "unknown",
    version: nextVersion,
    accessVersion: nextAccessVersion,
  });

  return {
    status: "applied",
    transitionId,
    previous: current,
    current: {
      id: current.id,
      schoolId: current.schoolId,
      accessState: nextAccessState,
      lifecycleState: targetLifecycle,
      reason: options.reason ?? null,
      effectiveUntil: effectiveUntil ?? null,
      sourceSubscriptionId: options.sourceSubscriptionId ?? null,
      accessVersion: nextAccessVersion,
      version: nextVersion,
      lastTransitionAt: now,
      exists: true,
    },
  };
}

export async function activateTrial(params: {
  schoolId: string;
  trialEndDate?: Date | null;
  performedBy?: string;
  reason?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "trial",
    accessState: "active",
    effectiveUntil: params.trialEndDate ?? null,
    reason: params.reason ?? "trial_activated",
    performedBy: params.performedBy,
    source: params.source ?? "system",
    schoolUpdate: params.trialEndDate ? { trialEndDate: params.trialEndDate } : undefined,
    useTransaction: params.useTransaction,
  });
}

export async function activatePaid(params: {
  schoolId: string;
  plan: string;
  periodStart: Date;
  periodEnd: Date;
  autoRenew?: boolean;
  paymentId?: string | null;
  performedBy?: string;
  reason?: string;
  source?: string;
  sourceSubscriptionId?: string | null;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  const schoolUpdate: Record<string, unknown> = {
    subscriptionPlan: params.plan,
    currentPeriodStart: params.periodStart,
    currentPeriodEnd: params.periodEnd,
    paymentFailureCount: 0,
    lastPaymentId: params.paymentId ?? null,
  };

  if (typeof params.autoRenew === "boolean") {
    schoolUpdate.autoRenew = params.autoRenew;
  }

  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "active",
    accessState: "active",
    effectiveUntil: addGracePeriod(params.periodEnd),
    reason: params.reason ?? "payment_received",
    performedBy: params.performedBy,
    source: params.source ?? "payment",
    sourceSubscriptionId: params.sourceSubscriptionId ?? null,
    schoolUpdate,
    useTransaction: params.useTransaction,
  });
}

export async function markPastDue(params: {
  schoolId: string;
  periodEnd?: Date | null;
  performedBy?: string;
  reason?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  const effectiveUntil = params.periodEnd ? addGracePeriod(params.periodEnd) : null;
  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "past_due",
    accessState: "active",
    effectiveUntil,
    reason: params.reason ?? "past_due",
    performedBy: params.performedBy,
    source: params.source ?? "system",
    schoolUpdate: params.periodEnd ? { currentPeriodEnd: params.periodEnd } : undefined,
    useTransaction: params.useTransaction,
  });
}

export async function expireTenant(params: {
  schoolId: string;
  performedBy?: string;
  reason?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "expired",
    accessState: "blocked",
    reason: params.reason ?? "expired",
    performedBy: params.performedBy,
    source: params.source ?? "system",
    useTransaction: params.useTransaction,
  });
}

export async function cancelTenant(params: {
  schoolId: string;
  cancelEffectiveDate?: Date | null;
  performedBy?: string;
  reason?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "cancelled",
    accessState: "blocked",
    effectiveUntil: params.cancelEffectiveDate ?? null,
    reason: params.reason ?? "cancelled",
    performedBy: params.performedBy,
    source: params.source ?? "system",
    schoolUpdate: params.cancelEffectiveDate
      ? { cancelEffectiveDate: params.cancelEffectiveDate }
      : undefined,
    useTransaction: params.useTransaction,
  });
}

export async function suspendTenant(params: {
  schoolId: string;
  performedBy?: string;
  reason?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "suspended",
    accessState: "blocked",
    reason: params.reason ?? "suspended",
    performedBy: params.performedBy,
    source: params.source ?? "system",
    bumpAccessVersion: true,
    useTransaction: params.useTransaction,
  });
}

export async function reactivateTenant(params: {
  schoolId: string;
  performedBy?: string;
  reason?: string;
  source?: string;
  useTransaction?: PrismaTransactionClient;
}): Promise<TransitionOutcome> {
  return transitionTenantLifecycle({
    schoolId: params.schoolId,
    targetLifecycle: "active",
    accessState: "active",
    reason: params.reason ?? "reactivated",
    performedBy: params.performedBy,
    source: params.source ?? "system",
    bumpAccessVersion: true,
    useTransaction: params.useTransaction,
  });
}

export function isAccessExpiredSnapshot(snapshot: TenantAccessSnapshot, now = new Date()): boolean {
  if (!snapshot.effectiveUntil) return false;
  if (snapshot.effectiveUntil.getTime() >= now.getTime()) return false;

  return (
    snapshot.lifecycleState === "trial" ||
    snapshot.lifecycleState === "past_due" ||
    snapshot.lifecycleState === "active" ||
    snapshot.lifecycleState === "cancelled"
  );
}

export async function queueExpiryFailsafe(params: {
  schoolId: string;
  lifecycleState: TenantLifecycleState;
  performedBy?: string;
  source?: string;
  reason?: string;
}): Promise<void> {
  const reason = params.reason ?? "request_expiry_failsafe";

  try {
    if (
      params.lifecycleState === "trial" ||
      params.lifecycleState === "past_due" ||
      params.lifecycleState === "cancelled"
    ) {
      await expireTenant({
        schoolId: params.schoolId,
        performedBy: params.performedBy,
        source: params.source ?? "request_failsafe",
        reason,
      });
      return;
    }

    if (params.lifecycleState === "active") {
      await expireTenant({
        schoolId: params.schoolId,
        performedBy: params.performedBy,
        source: params.source ?? "request_failsafe",
        reason,
      });
    }
  } catch (error) {
    log.warn({ err: error, schoolId: params.schoolId }, "Failed to apply expiry failsafe");
  }
}

export async function resolveAccessVersion(
  schoolId: string | null | undefined,
  options: { useTransaction?: PrismaTransactionClient } = {}
): Promise<number> {
  if (!schoolId) return 0;
  const snapshot = await resolveTenantAccessState(String(schoolId), options);
  if (!snapshot) return 0;
  return snapshot.accessVersion ?? 0;
}
