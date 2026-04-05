import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client.
 *
 * In development, we store the client on `globalThis` so that hot-reloading
 * (via `tsx watch`) doesn't create a new connection pool on every restart.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function withPoolTuning(databaseUrl?: string): string | undefined {
  if (!databaseUrl) return undefined;

  try {
    const parsed = new URL(databaseUrl);

    // Keep lower pool in development and increase in non-dev environments.
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set(
        "connection_limit",
        process.env.NODE_ENV === "development" ? "20" : "50"
      );
    }

    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "20");
    }

    return parsed.toString();
  } catch {
    // If URL parsing fails, keep the original value untouched.
    return databaseUrl;
  }
}

const tunedDatabaseUrl = withPoolTuning(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(tunedDatabaseUrl
      ? {
          datasources: {
            db: {
              url: tunedDatabaseUrl,
            },
          },
        }
      : {}),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
