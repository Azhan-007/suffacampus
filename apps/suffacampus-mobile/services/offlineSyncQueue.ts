import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";

const OFFLINE_QUEUE_KEY = "SuffaCampus.offlineMutationQueue.v1";

type QueueableMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export interface OfflineMutation {
  id: string;
  path: string;
  method: QueueableMethod;
  body?: unknown;
  createdAt: string;
  attempts: number;
  nextRetryAt: number;
}

function makeMutationId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function isLikelyTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("request failed")
  );
}

function retryDelayMs(attempts: number): number {
  const capped = Math.min(attempts, 6);
  return Math.min(120_000, 2 ** capped * 1_000);
}

async function readQueue(): Promise<OfflineMutation[]> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as OfflineMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: OfflineMutation[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueOfflineMutation(input: {
  path: string;
  method: QueueableMethod;
  body?: unknown;
}): Promise<string> {
  const queue = await readQueue();
  const entry: OfflineMutation = {
    id: makeMutationId(),
    path: input.path,
    method: input.method,
    body: input.body,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextRetryAt: Date.now(),
  };

  queue.push(entry);
  await writeQueue(queue);
  return entry.id;
}

export async function getOfflineQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function flushOfflineQueue(options?: {
  paths?: string[];
  maxItems?: number;
}): Promise<{ flushed: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  const now = Date.now();
  const maxItems = Math.max(1, options?.maxItems ?? 20);
  const pathFilter = options?.paths;

  let processed = 0;
  let flushed = 0;
  const nextQueue: OfflineMutation[] = [];

  for (const item of queue) {
    const isPathMatch = !pathFilter || pathFilter.includes(item.path);
    const canRun = item.nextRetryAt <= now;

    if (!isPathMatch || !canRun || processed >= maxItems) {
      nextQueue.push(item);
      continue;
    }

    processed += 1;

    try {
      await apiFetch(item.path, {
        method: item.method,
        body: item.body,
      });
      flushed += 1;
    } catch (error) {
      const attempts = item.attempts + 1;
      const shouldRetry = isLikelyTransientNetworkError(error) || attempts < 5;

      if (shouldRetry) {
        nextQueue.push({
          ...item,
          attempts,
          nextRetryAt: now + retryDelayMs(attempts),
        });
      }
    }
  }

  await writeQueue(nextQueue);
  return { flushed, remaining: nextQueue.length };
}

