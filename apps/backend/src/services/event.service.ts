import { prisma } from "../lib/prisma";
import type { CreateEventInput, UpdateEventInput } from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";
import { assertSchoolScope } from "../lib/tenant-scope";
import { sendToSchool, PushTemplates } from "./push-notification.service";
import pino from "pino";

const log = pino({ name: "event-service" });

export async function createEvent(
  schoolId: string,
  data: CreateEventInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const event = await prisma.event.create({
    data: {
      schoolId,
      createdBy: performedBy,
      title: data.title,
      description: data.description,
      eventDate: data.eventDate,
      endDate: data.endDate,
      eventType: data.eventType as any,
      targetAudience: data.targetAudience ?? [],
      location: data.location,
      organizer: data.organizer,
      imageURL: data.imageURL,
      isActive: true,
    },
  });

  await writeAuditLog("CREATE_EVENT", performedBy, schoolId, {
    eventId: event.id,
    title: event.title,
    eventType: event.eventType,
  });

  // Broadcast event announcement to entire school (non-blocking)
  sendToSchool(
    schoolId,
    PushTemplates.eventAnnouncement(event.title, String(event.eventDate))
  ).catch((err) => {
    log.warn({ err, schoolId, eventId: event.id }, "Failed to send event push notification");
  });

  return event;
}

export async function getEventsBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { eventType?: string; upcoming?: boolean } = {}
) {
  assertSchoolScope(schoolId);

  const where: any = { schoolId, isActive: true };

  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.upcoming) {
    where.eventDate = { gte: new Date().toISOString() };
  }

  const limit = Math.min(pagination.limit ?? 20, 100);
  const sortBy = pagination.sortBy ?? "eventDate";
  const sortOrder = filters.upcoming ? "asc" : (pagination.sortOrder ?? "desc");

  const events = await prisma.event.findMany({
    where,
    orderBy: { [sortBy]: sortOrder },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = events.length > limit;
  const data = hasMore ? events.slice(0, limit) : events;

  return {
    data,
    pagination: {
      cursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
      limit,
    },
  };
}

export async function getEventById(eventId: string, schoolId: string) {
  assertSchoolScope(schoolId);

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  if (event.schoolId !== schoolId) return null;
  if (!event.isActive) return null;
  return event;
}

export async function updateEvent(
  eventId: string,
  schoolId: string,
  data: UpdateEventInput,
  performedBy: string
) {
  assertSchoolScope(schoolId);

  const existing = await prisma.event.findUnique({ where: { id: eventId } });

  if (!existing) throw Errors.notFound("Event", eventId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Event", eventId);

  // Explicit field mapping — never spread raw input into Prisma
  const safeUpdate: Record<string, unknown> = {};
  if (data.title !== undefined) safeUpdate.title = data.title;
  if (data.description !== undefined) safeUpdate.description = data.description;
  if (data.eventDate !== undefined) safeUpdate.eventDate = data.eventDate;
  if (data.endDate !== undefined) safeUpdate.endDate = data.endDate;
  if (data.eventType !== undefined) safeUpdate.eventType = data.eventType;
  if (data.targetAudience !== undefined) safeUpdate.targetAudience = data.targetAudience;
  if (data.location !== undefined) safeUpdate.location = data.location;
  if (data.organizer !== undefined) safeUpdate.organizer = data.organizer;
  if (data.imageURL !== undefined) safeUpdate.imageURL = data.imageURL;
  if (data.isActive !== undefined) safeUpdate.isActive = data.isActive;

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: safeUpdate,
  });

  await writeAuditLog("UPDATE_EVENT", performedBy, schoolId, {
    eventId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteEvent(
  eventId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  assertSchoolScope(schoolId);

  const existing = await prisma.event.findUnique({ where: { id: eventId } });

  if (!existing) return false;
  if (existing.schoolId !== schoolId) return false;
  if (!existing.isActive) return false;

  await prisma.event.update({
    where: { id: eventId },
    data: { isActive: false },
  });

  await writeAuditLog("DELETE_EVENT", performedBy, schoolId, {
    eventId,
    title: existing.title,
  });

  return true;
}
