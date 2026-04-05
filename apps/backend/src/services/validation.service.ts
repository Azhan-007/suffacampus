/**
 * Temporal Validation Service
 * Prevents backdating of attendance, assignments, and other time-sensitive operations
 */

import { Errors } from "../errors";

/**
 * Validates that attendance date is not too far in the past (max 3 days)
 * Prevents backdating attacks from staff
 * @param attendanceDate - Date string in YYYY-MM-DD format
 * @throws BadRequestError if date is too old
 */
export function validateAttendanceDate(attendanceDate: string): void {
  const date = new Date(attendanceDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to midnight

  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw Errors.badRequest("Invalid date format");
  }

  // Allow same day + 3 days in the past
  const allowedPastDay = new Date(today);
  allowedPastDay.setDate(allowedPastDay.getDate() - 3);

  date.setHours(0, 0, 0, 0); // Normalize input date

  if (date < allowedPastDay) {
    throw Errors.badRequest(
      `Attendance can only be marked for dates within the last 3 days. Provided: ${attendanceDate}`
    );
  }

  // Prevent future dates
  if (date > today) {
    throw Errors.badRequest("Cannot mark attendance for future dates");
  }
}

/**
 * Validates that assignment deadline is not too far in the past
 * Allows grace period for delayed submissions but prevents old dates
 * @param deadline - Date string in YYYY-MM-DD format
 * @throws BadRequestError if deadline is too old
 */
export function validateAssignmentDeadline(deadline: string): void {
  const deadlineDate = new Date(deadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to midnight

  // Check if date is valid
  if (isNaN(deadlineDate.getTime())) {
    throw Errors.badRequest("Invalid deadline format");
  }

  // Allow grace period: 7 days in the past (for backdated submissions)
  const allowedPastDay = new Date(today);
  allowedPastDay.setDate(allowedPastDay.getDate() - 7);

  deadlineDate.setHours(0, 0, 0, 0);

  if (deadlineDate < allowedPastDay) {
    throw Errors.badRequest(
      `Assignment deadline cannot be more than 7 days in the past. Provided: ${deadline}`
    );
  }
}

/**
 * Validates that a date is within acceptable business hours window
 * Prevents manipulation of time-based metrics
 * @param timestamp - Unix timestamp in milliseconds
 * @returns true if within 24-hour window, false otherwise
 */
export function isWithinProcessingWindow(timestamp: number): boolean {
  const now = Date.now();
  const diff = now - timestamp;
  const hoursOld = diff / (1000 * 60 * 60);

  return hoursOld <= 24;
}

/**
 * Validates fee due date is in the future or near past
 * @param dueDate - Date string in YYYY-MM-DD format
 * @throws BadRequestError if date is too old
 */
export function validateFeeDueDate(dueDate: string): void {
  const date = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(date.getTime())) {
    throw Errors.badRequest("Invalid due date format");
  }

  // Allow backdate up to 30 days for corrections
  const allowedPastDay = new Date(today);
  allowedPastDay.setDate(allowedPastDay.getDate() - 30);

  date.setHours(0, 0, 0, 0);

  if (date < allowedPastDay) {
    throw Errors.badRequest(
      `Fee due date cannot be more than 30 days in the past. Provided: ${dueDate}`
    );
  }
}
