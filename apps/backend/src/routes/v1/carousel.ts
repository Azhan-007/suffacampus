import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { sendSuccess } from "../../utils/response";

/**
 * Carousel stub routes.
 * These return empty data so the mobile app doesn't error out.
 * Replace with real Firestore-backed implementation when ready.
 */
export default async function carouselRoutes(server: FastifyInstance) {
  const preHandler = [authenticate, tenantGuard];

  server.get("/carousel", { preHandler }, async (request, reply) => {
    return sendSuccess(request, reply, []);
  });

  server.post("/carousel", { preHandler }, async (request, reply) => {
    return sendSuccess(request, reply, { id: "stub", ...(request.body as object) });
  });

  server.patch("/carousel/:id", { preHandler }, async (request, reply) => {
    return sendSuccess(request, reply, { id: (request.params as any).id });
  });

  server.delete("/carousel/:id", { preHandler }, async (request, reply) => {
    return sendSuccess(request, reply, null);
  });
}
