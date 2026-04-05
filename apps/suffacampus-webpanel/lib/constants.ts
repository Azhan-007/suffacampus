/**
 * Shared constants used across multiple pages.
 *
 * Subjects & departments have no dedicated backend endpoint so we maintain
 * a canonical list here and merge with any custom values from real data
 * (e.g. teacher records) at runtime.
 */

/** Canonical subject list – used as baseline in teachers, results, timetable */
export const DEFAULT_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'English', 'Hindi',
  'History', 'Geography',
  'Computer Science', 'Physical Education',
  'Arts', 'Music',
  'Economics', 'Accountancy', 'Business Studies', 'Political Science',
] as const;

/** Canonical department list – used in teacher management */
export const DEFAULT_DEPARTMENTS = [
  'Science', 'Languages', 'Social Studies', 'Sports',
  'Technology', 'Arts', 'Commerce', 'Humanities',
] as const;

/** Exam type labels – used in results */
export const EXAM_TYPES = [
  'Mid Term', 'Final', 'Unit Test', 'Quarterly', 'Half Yearly', 'Annual',
] as const;

/** Days of the week for timetable */
export const DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;
