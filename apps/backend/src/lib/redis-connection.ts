import type { RedisOptions } from "ioredis";

export const redisConnectionUrl = process.env.REDIS_URL;

export const redisConnectionConfig: RedisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
};
