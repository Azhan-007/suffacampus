import type { FastifyInstance } from "fastify";
import studentRoutes from "./students";
import teacherRoutes from "./teachers";
import attendanceRoutes from "./attendance";
import paymentRoutes from "./payments";
import authRoutes from "./auth";
import classRoutes from "./classes";
import eventRoutes from "./events";
import feeRoutes from "./fees";
import libraryRoutes from "./library";
import resultRoutes from "./results";
import timetableRoutes from "./timetable";
import settingsRoutes from "./settings";
import dashboardRoutes from "./dashboard";
import adminRoutes from "./admin";
import userRoutes from "./users";
import subscriptionRoutes from "./subscriptions";
import exportRoutes from "./exports";
import notificationRoutes from "./notifications";
import notificationPreferenceRoutes from "./notification-preferences";
import uploadRoutes from "./uploads";
import importRoutes from "./imports";
import reportRoutes from "./reports";
import parentRoutes from "./parent";
import searchRoutes from "./search";
import auditRoutes from "./audit";
import carouselRoutes from "./carousel";
import teacherExtrasRoutes from "./teacher-extras";
import assignmentRoutes from "./assignments";
import questionBankRoutes from "./question-bank";
import activityRoutes from "./activities";
import configRoutes from "./config";
import integrationsRoutes from "./integrations";
import dataPrivacyRoutes from "./data-privacy";

/**
 * Register all v1 API routes.
 *
 * This plugin is mounted at `/api/v1` in server.ts, so all routes
 * defined here are automatically prefixed:
 *
 *   /students  →  /api/v1/students
 *   /teachers  →  /api/v1/teachers
 *   etc.
 */
export default async function v1Routes(server: FastifyInstance) {
  // Public routes (no auth)
  server.register(authRoutes);

  // Protected routes
  server.register(studentRoutes);
  server.register(teacherRoutes);
  server.register(attendanceRoutes);
  server.register(paymentRoutes);
  server.register(classRoutes);
  server.register(eventRoutes);
  server.register(feeRoutes);
  server.register(libraryRoutes);
  server.register(resultRoutes);
  server.register(timetableRoutes);
  server.register(settingsRoutes);
  server.register(dashboardRoutes);
  server.register(adminRoutes);
  server.register(userRoutes);
  server.register(subscriptionRoutes);
  server.register(exportRoutes);
  server.register(notificationRoutes);
  server.register(notificationPreferenceRoutes);
  server.register(uploadRoutes);
  server.register(importRoutes);
  server.register(reportRoutes);
  server.register(parentRoutes);
  server.register(searchRoutes);
  server.register(auditRoutes);
  server.register(carouselRoutes);
  server.register(teacherExtrasRoutes);
  server.register(assignmentRoutes);
  server.register(questionBankRoutes);
  server.register(activityRoutes);
  server.register(configRoutes);
  server.register(integrationsRoutes);
  server.register(dataPrivacyRoutes);
}
