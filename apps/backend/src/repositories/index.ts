/**
 * Repository Index
 * Export all repository instances
 */

export { BaseRepository, type Filter, type PaginationParams, type PaginatedResult } from "./base.repository";
export { StudentRepository } from "./student.repository";
export { ActivityRepository } from "./activity.repository";
export { AttendanceRepository } from "./attendance.repository";

// Singleton instances (reuse across application)
export const repositories = {
  student: new (require("./student.repository").StudentRepository)(),
  activity: new (require("./activity.repository").ActivityRepository)(),
  attendance: new (require("./attendance.repository").AttendanceRepository)(),
};
