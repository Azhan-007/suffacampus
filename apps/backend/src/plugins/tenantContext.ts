import type { FastifyInstance } from "fastify";
import { runWithTenantContext } from "../lib/tenant-context";

/**
 * Initializes request-scoped tenant context for every incoming request.
 * Downstream middleware can set schoolId/enforcement flags in this store.
 */
export async function tenantContextPlugin(server: FastifyInstance) {
  server.addHook("onRequest", (_request, _reply, done) => {
    runWithTenantContext(() => done());
  });
}
