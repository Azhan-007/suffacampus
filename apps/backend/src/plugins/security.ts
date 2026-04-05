import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";

export async function securityHeaders(server: FastifyInstance) {
  await server.register(helmet, {
    global: true,
    hidePoweredBy: true,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  });

  server.addHook("onSend", (_request, reply, payload, done) => {
    // Keep explicit XSS protection header for legacy browser support.
    reply.header("X-XSS-Protection", "1; mode=block");

    if (process.env.NODE_ENV === "production") {
      reply.header(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload"
      );
    }

    // Disable caching for API responses
    reply.header(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    reply.header("Pragma", "no-cache");
    reply.header("Expires", "0");

    done(null, payload);
  });
}
