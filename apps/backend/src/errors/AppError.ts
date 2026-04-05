/**
 * Centralised application error class.
 *
 * Every error thrown intentionally in the codebase should be (or extend)
 * an `AppError` so the global error handler can format it consistently.
 *
 * - `statusCode`  — HTTP status to return (400, 403, 404, 409, 500…)
 * - `code`        — Machine-readable, UPPER_SNAKE_CASE string
 * - `message`     — Human-readable explanation
 * - `details`     — Optional payload (validation issues, context, etc.)
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintain proper prototype chain (TypeScript + ES2022 target)
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** Slim serialisation — safe to send to clients */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

// ---------------------------------------------------------------------------
// Pre-built factory helpers for common error scenarios
// ---------------------------------------------------------------------------

export const Errors = {
  // ---- Auth ---------------------------------------------------------------
  tokenMissing: () =>
    new AppError(401, "AUTH_TOKEN_MISSING", "Authorization token is required"),

  tokenInvalid: () =>
    new AppError(401, "AUTH_TOKEN_INVALID", "Invalid or expired token"),

  userNotFound: () =>
    new AppError(401, "AUTH_USER_NOT_FOUND", "User account not found"),

  userDisabled: () =>
    new AppError(403, "AUTH_USER_DISABLED", "User account has been deactivated"),

  // ---- Tenant -------------------------------------------------------------
  tenantMissing: () =>
    new AppError(403, "TENANT_MISSING", "User is not associated with a school"),

  tenantMismatch: () =>
    new AppError(403, "TENANT_MISMATCH", "Resource does not belong to your school"),

  // ---- RBAC ---------------------------------------------------------------
  insufficientRole: (required: string[]) =>
    new AppError(403, "ROLE_UNAUTHORIZED", "Insufficient permissions", {
      required,
    }),

  // ---- Subscription -------------------------------------------------------
  subscriptionExpired: () =>
    new AppError(403, "SUBSCRIPTION_EXPIRED", "Your subscription has expired"),

  subscriptionLimitReached: (resource: string, limit: number) =>
    new AppError(
      403,
      "SUBSCRIPTION_LIMIT_REACHED",
      `You have reached the maximum number of ${resource} allowed on your plan (${limit})`,
      { resource, limit }
    ),

  // ---- Resource -----------------------------------------------------------
  notFound: (resource: string, id?: string) =>
    new AppError(
      404,
      "RESOURCE_NOT_FOUND",
      id ? `${resource} (${id}) not found` : `${resource} not found`
    ),

  alreadyExists: (resource: string, identifier?: string) =>
    new AppError(
      409,
      "RESOURCE_ALREADY_EXISTS",
      identifier
        ? `${resource} "${identifier}" already exists`
        : `${resource} already exists`
    ),

  conflict: (message: string) =>
    new AppError(409, "CONFLICT", message),

  // ---- Validation ---------------------------------------------------------
  validation: (details: unknown) =>
    new AppError(400, "VALIDATION_ERROR", "Validation failed", details),

  badRequest: (message: string, details?: unknown) =>
    new AppError(400, "BAD_REQUEST", message, details),

  // ---- Payment ------------------------------------------------------------
  paymentFailed: (message: string) =>
    new AppError(402, "PAYMENT_FAILED", message),

  paymentDuplicate: () =>
    new AppError(409, "PAYMENT_DUPLICATE", "Payment has already been processed"),

  // ---- Rate limiting ------------------------------------------------------
  rateLimitExceeded: () =>
    new AppError(429, "RATE_LIMIT_EXCEEDED", "Too many requests — please slow down"),

  // ---- Internal -----------------------------------------------------------
  internal: (message = "Internal server error") =>
    new AppError(500, "INTERNAL_ERROR", message),
} as const;
