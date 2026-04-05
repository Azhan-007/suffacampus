import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  redisConnectionConfig,
} from "../lib/redis-connection";

let notificationQueueConnection: IORedis | null = null;
let notificationQueue: Queue | null = null;

export function getNotificationQueueConnection(): IORedis | null {
  const connectionUrl = process.env.REDIS_URL;
  if (!connectionUrl) {
    return null;
  }

  if (!notificationQueueConnection) {
    notificationQueueConnection = new IORedis(connectionUrl, redisConnectionConfig);
  }

  return notificationQueueConnection;
}

export function getNotificationQueue(): Queue | null {
  const connection = getNotificationQueueConnection();
  if (!connection) {
    return null;
  }

  if (!notificationQueue) {
    notificationQueue = new Queue("notificationQueue", {
      connection,
    });
  }

  return notificationQueue;
}
