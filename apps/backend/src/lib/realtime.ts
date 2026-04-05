import type WebSocket from "ws";
import Redis from "ioredis";

export interface RealtimeActivityPayload {
  id: string;
  schoolId: string;
  studentId?: string | null;
  teacherId?: string | null;
  userId: string;
  title: string;
  description?: string | null;
  type: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date;
}

type ClientId = string;

interface RealtimeClient {
  id: ClientId;
  socket: WebSocket;
  schoolId: string;
  studentId?: string;
}

const clients = new Map<ClientId, RealtimeClient>();
const ACTIVITY_CHANNEL = "SuffaCampus:activity:created";
const INSTANCE_ID = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

let redisPub: Redis | null = null;
let redisSub: Redis | null = null;
let redisBridgeReady = false;

export function getRealtimeBridgeStatus(): {
  enabled: boolean;
  ready: boolean;
  publisherConnected: boolean;
  subscriberConnected: boolean;
} {
  return {
    enabled: Boolean(process.env.REDIS_URL),
    ready: redisBridgeReady,
    publisherConnected: redisPub?.status === "ready",
    subscriberConnected: redisSub?.status === "ready",
  };
}

function makeClientId(): ClientId {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function registerRealtimeClient(params: {
  socket: WebSocket;
  schoolId: string;
  studentId?: string;
}): ClientId {
  const id = makeClientId();
  clients.set(id, {
    id,
    socket: params.socket,
    schoolId: params.schoolId,
    studentId: params.studentId,
  });
  return id;
}

export function unregisterRealtimeClient(clientId: ClientId): void {
  clients.delete(clientId);
}

function isSocketOpen(socket: WebSocket): boolean {
  return (socket as unknown as { readyState: number }).readyState === 1;
}

function publishActivityCreatedLocal(activity: RealtimeActivityPayload): void {
  const payload = JSON.stringify({
    type: "activity.created",
    data: {
      ...activity,
      createdAt:
        activity.createdAt instanceof Date
          ? activity.createdAt.toISOString()
          : activity.createdAt,
    },
  });

  for (const [clientId, client] of clients.entries()) {
    if (client.schoolId !== activity.schoolId) continue;

    if (client.studentId && client.studentId !== activity.studentId) {
      continue;
    }

    if (!isSocketOpen(client.socket)) {
      clients.delete(clientId);
      continue;
    }

    try {
      client.socket.send(payload);
    } catch {
      clients.delete(clientId);
    }
  }
}

export async function initRealtimeBridge(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || redisBridgeReady) {
    return;
  }

  try {
    redisPub = new Redis(redisUrl, { maxRetriesPerRequest: null });
    redisSub = new Redis(redisUrl, { maxRetriesPerRequest: null });

    await redisSub.subscribe(ACTIVITY_CHANNEL);
    redisSub.on("message", (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as {
          origin: string;
          activity: RealtimeActivityPayload;
        };

        if (message.origin === INSTANCE_ID) {
          return;
        }

        publishActivityCreatedLocal(message.activity);
      } catch {
        // Ignore malformed pubsub payloads
      }
    });

    redisBridgeReady = true;
  } catch {
    redisBridgeReady = false;

    if (redisPub) {
      redisPub.disconnect();
      redisPub = null;
    }
    if (redisSub) {
      redisSub.disconnect();
      redisSub = null;
    }
  }
}

export async function shutdownRealtimeBridge(): Promise<void> {
  redisBridgeReady = false;
  await Promise.allSettled([
    redisPub?.quit() ?? Promise.resolve(),
    redisSub?.quit() ?? Promise.resolve(),
  ]);
  redisPub = null;
  redisSub = null;
}

export function publishActivityCreated(activity: RealtimeActivityPayload): void {
  publishActivityCreatedLocal(activity);

  if (redisBridgeReady && redisPub) {
    redisPub
      .publish(
        ACTIVITY_CHANNEL,
        JSON.stringify({
          origin: INSTANCE_ID,
          activity,
        })
      )
      .catch(() => {
        // Ignore transient pubsub failures; local delivery already happened.
      });
  }
}

