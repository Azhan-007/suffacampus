-- Add session column to Attendance (default "FN" for existing records)
ALTER TABLE "Attendance" ADD COLUMN "session" TEXT NOT NULL DEFAULT 'FN';

-- Drop old unique constraint (schoolId, studentId, date)
DROP INDEX IF EXISTS "Attendance_schoolId_studentId_date_key";

-- Create new unique constraint (schoolId, studentId, date, session)
CREATE UNIQUE INDEX "Attendance_schoolId_studentId_date_session_key"
  ON "Attendance"("schoolId", "studentId", "date", "session");
