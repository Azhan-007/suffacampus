import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Unique per-request identifier for tracing */
    requestId: string;
    /** High-resolution start time (for duration calculation) */
    startTime: bigint;
  }
}

/**
 * Fastify plugin that:
 * 1. Assigns a UUID requestId to every request (or reuses the client-supplied one)
 * 2. Returns it in the `X-Request-Id` response header
 * 3. Enriches the per-request Pino logger child with `requestId`
 * 4. Tracks request duration and logs it on response
 */
export async function requestContext(server: FastifyInstance) {
  // ---- Assign requestId + start timer -----------------------------------
  server.addHook("onRequest", (request, reply, done) => {
    const incoming = request.headers["x-request-id"];
    request.requestId =
      typeof incoming === "string" && incoming.length > 0
        ? incoming
        : crypto.randomUUID();

    request.startTime = process.hrtime.bigint();

    reply.header("X-Request-Id", request.requestId);
    reply.header("X-API-Version", "1");

    // Enrich Pino child logger
    request.log = request.log.child({ requestId: request.requestId });

    done();
  });

  // ---- Log completed request with duration ------------------------------
  server.addHook("onResponse", (request, reply, done) => {
    const durationMs = Number(process.hrtime.bigint() - request.startTime) / 1e6;

    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: request.user?.uid,
        schoolId: request.schoolId,
      },
      "request completed"
    );

    done();
  });
}
