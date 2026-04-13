import { Errors } from "../errors";

export type TenantPlanCode = "free" | "basic" | "pro" | "enterprise";

const PLAN_ALIASES: Record<string, TenantPlanCode> = {
  free: "free",
  trial: "free",
  basic: "basic",
  starter: "basic",
  pro: "pro",
  standard: "pro",
  enterprise: "enterprise",
  premium: "enterprise",
};

const PLAN_STUDENT_LIMITS: Record<TenantPlanCode, number> = {
  free: 200,
  basic: 500,
  pro: 2000,
  enterprise: -1,
};

const PLAN_TEACHER_LIMITS: Record<TenantPlanCode, number> = {
  free: 20,
  basic: 50,
  pro: 200,
  enterprise: -1,
};

const PLAN_CLASS_LIMITS: Record<TenantPlanCode, number> = {
  free: 10,
  basic: 25,
  pro: 100,
  enterprise: -1,
};

export function assertSchoolScope(
  schoolId: string | null | undefined,
  reason = "Missing schoolId"
): asserts schoolId is string {
  if (typeof schoolId !== "string" || schoolId.trim().length === 0) {
    if (reason === "Missing schoolId") {
      throw Errors.tenantMissing();
    }

    throw Errors.badRequest(reason);
  }
}

export function normalizeTenantPlan(plan: unknown): TenantPlanCode {
  const key = String(plan ?? "free").trim().toLowerCase();
  return PLAN_ALIASES[key] ?? "free";
}

function pickLimit(planLimit: number, explicitLimit?: number | null): number {
  if (typeof explicitLimit === "number" && Number.isFinite(explicitLimit)) {
    const normalized = Math.trunc(explicitLimit);
    if (normalized === -1 || normalized > 0) {
      return normalized;
    }
  }

  return planLimit;
}

export function resolveStudentLimitForPlan(
  plan: unknown,
  explicitLimit?: number | null
): number {
  const normalizedPlan = normalizeTenantPlan(plan);
  return pickLimit(PLAN_STUDENT_LIMITS[normalizedPlan], explicitLimit);
}

export function resolveTeacherLimitForPlan(
  plan: unknown,
  explicitLimit?: number | null
): number {
  const normalizedPlan = normalizeTenantPlan(plan);
  return pickLimit(PLAN_TEACHER_LIMITS[normalizedPlan], explicitLimit);
}

export function resolveClassLimitForPlan(
  plan: unknown,
  explicitLimit?: number | null
): number {
  const normalizedPlan = normalizeTenantPlan(plan);
  return pickLimit(PLAN_CLASS_LIMITS[normalizedPlan], explicitLimit);
}
