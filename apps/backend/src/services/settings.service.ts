import { prisma } from "../lib/prisma";
import type { UpdateSettingsInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

/**
 * Retrieve school settings (from the School model).
 */
export async function getSettings(schoolId: string) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return null;
  return school;
}

/**
 * Update school settings (partial merge).
 */
export async function updateSettings(
  schoolId: string,
  data: UpdateSettingsInput,
  performedBy: string
) {
  const existing = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!existing) throw Errors.notFound("School", schoolId);

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: data as any,
  });

  await writeAuditLog("UPDATE_SETTINGS", performedBy, schoolId, {
    updatedFields: Object.keys(data),
  });

  return updated;
}
