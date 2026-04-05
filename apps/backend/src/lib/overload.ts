import type { FastifyReply, FastifyRequest } from "fastify";
import { recordOverloadShedRequest } from "../plugins/metrics";

type OverloadLane = "auth_lookup" | "auth_login" | "dashboard";

const inFlightByLane = new Map<OverloadLane, number>();
const RETRY_AFTER_SECONDS = 1;

function readPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return fallback;
}

function laneLimit(lane: OverloadLane): number {
  if (process.env.NODE_ENV === "test") return Number.MAX_SAFE_INTEGER;

  if (lane === "auth_lookup") {
    return readPositiveInt("CRITICAL_AUTH_LOOKUP_CONCURRENCY", 150);
  }
  if (lane === "auth_login") {
    return readPositiveInt("CRITICAL_AUTH_LOGIN_CONCURRENCY", 120);
  }
  return readPositiveInt("CRITICAL_DASHBOARD_CONCURRENCY", 220);
}

function acquireLane(lane: OverloadLane): (() => void) | null {
  const current = inFlightByLane.get(lane) ?? 0;
  const limit = laneLimit(lane);
  if (current >= limit) return null;

  inFlightByLane.set(lane, current + 1);

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const next = (inFlightByLane.get(lane) ?? 1) - 1;
    if (next <= 0) {
      inFlightByLane.delete(lane);
      return;
    }
    inFlightByLane.set(lane, next);
  };
}

export function enterCriticalLaneOrReplyOverloaded(
  request: FastifyRequest,
  reply: FastifyReply,
  lane: OverloadLane
): (() => void) | null {
  const release = acquireLane(lane);
  if (release) return release;

  recordOverloadShedRequest(lane, request.method);
  void reply
    .status(503)
    .header("Retry-After", String(RETRY_AFTER_SECONDS))
    .send({
      success: false,
      error: {
        code: "OVERLOADED_RETRY_LATER",
        message: "Service is temporarily overloaded. Please retry shortly.",
      },
      meta: { requestId: request.requestId ?? "unknown" },
    });

  return null;
}
