import { z } from "zod";

const superadminEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL is required"),
  FIREBASE_PROJECT_ID: z
    .string()
    .trim()
    .min(1, "FIREBASE_PROJECT_ID is required"),
  FIREBASE_CLIENT_EMAIL: z
    .string()
    .trim()
    .min(1, "FIREBASE_CLIENT_EMAIL is required"),
  FIREBASE_PRIVATE_KEY: z
    .string()
    .trim()
    .min(1, "FIREBASE_PRIVATE_KEY is required"),
  SUPERADMIN_EMAIL: z
    .string()
    .trim()
    .email("SUPERADMIN_EMAIL must be a valid email address"),
  SUPERADMIN_PASSWORD: z
    .string()
    .trim()
    .min(8, "SUPERADMIN_PASSWORD must be at least 8 characters long"),
  SUPERADMIN_DISPLAY_NAME: z.string().trim().optional(),
});

const parsed = superadminEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Environment validation failed for create-superadmin.ts:\n${issues}`
  );
}

export const superadminEnv = parsed.data;
