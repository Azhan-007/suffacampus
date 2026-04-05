import { z } from "zod";
import { createStudentSchema } from "./student.schema";
import { createTeacherSchema } from "./teacher.schema";

/**
 * Update schemas — partial versions of the create schemas.
 * Every field becomes optional so clients can PATCH individual fields.
 */

export const updateStudentSchema = createStudentSchema.partial();
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const updateTeacherSchema = createTeacherSchema.partial();
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>;
