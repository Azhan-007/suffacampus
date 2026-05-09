import { prisma } from "../lib/prisma";
import type { UpdateSettingsInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";

/**
 * Allowlist of School model fields that are safe to update via PATCH /settings.
 * Any field NOT in this list is blocked — prevents mass assignment of
 * billing, subscription, or internal fields.
 */
const SETTINGS_ALLOWLIST = [
  "schoolName",
  "schoolCode",
  "address",
  "city",
  "state",
  "pincode",
  "phone",
  "email",
  "website",
  "logoURL",
  "primaryColor",
  "secondaryColor",
  "currentSession",
  "sessionStartMonth",
  "sessionEndMonth",
  "currency",
  "dateFormat",
  "timeFormat",
  "timezone",
  "emailNotifications",
  "smsNotifications",
] as const;

/**
 * Retrieve school settings.
 *
 * Returns the full School object for backward compatibility.
 * Security boundary is enforced on WRITES (via SETTINGS_ALLOWLIST),
 * not on reads — Admin users legitimately need plan/limit info.
 */
export async function getSettings(schoolId: string) {
  assertSchoolScope(schoolId);

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
  });
  if (!school) return null;
  return school;
}

/**
 * Update school settings (partial merge).
 *
 * Uses a strict allowlist to prevent mass assignment of sensitive fields
 * like subscriptionPlan, subscriptionStatus, maxStudents, isActive, etc.
 */
export async function updateSettings(
  schoolId: string,
  data: UpdateSettingsInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!existing) throw Errors.notFound("School", schoolId);

  // Defensive allowlist — never pass raw input to Prisma
  const safeData: Record<string, unknown> = {};
  for (const key of SETTINGS_ALLOWLIST) {
    if (key in data && data[key as keyof typeof data] !== undefined) {
      safeData[key] = data[key as keyof typeof data];
    }
  }

  if (Object.keys(safeData).length === 0) {
    throw Errors.badRequest("No valid settings fields to update");
  }

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: safeData,
  });

  await writeAuditLog("UPDATE_SETTINGS", performedBy, schoolId, {
    updatedFields: Object.keys(safeData),
  });

  return updated;
}
