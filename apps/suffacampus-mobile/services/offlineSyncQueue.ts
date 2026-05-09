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
  /** Optional dedup key. If a queued item with the same key exists, it is replaced. */
  dedupKey?: string;
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
  /**
   * Optional deduplication key. If a queued item with the same dedupKey
   * already exists, it is replaced instead of creating a duplicate.
   * Use for idempotent mutations like attendance upserts.
   */
  dedupKey?: string;
}): Promise<string> {
  let queue = await readQueue();

  const entry: OfflineMutation = {
    id: makeMutationId(),
    path: input.path,
    method: input.method,
    body: input.body,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextRetryAt: Date.now(),
    dedupKey: input.dedupKey,
  };

  // Replace existing entry with same dedup key (prevents queue bloat)
  if (input.dedupKey) {
    queue = queue.filter((item) => item.dedupKey !== input.dedupKey);
  }

  queue.push(entry);
  await writeQueue(queue);
  return entry.id;
}

export async function getOfflineQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

/** Quick check — avoids parsing the full JSON when only checking emptiness. */
export async function isQueueEmpty(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw || raw === "[]" || raw.trim().length === 0) return true;
  return false;
}

/**
 * Expose pending queue items so the UI can show what's waiting to sync.
 * Returns a read-only snapshot — modifying the returned array has no effect.
 */
export async function getOfflineQueueItems(): Promise<ReadonlyArray<OfflineMutation>> {
  return readQueue();
}

/**
 * Remove mutations older than `maxAgeMs` (default: 7 days).
 * Prevents the queue from growing unboundedly if a mutation is permanently
 * un-flushable (e.g. the endpoint was removed).
 */
export async function clearExpiredItems(maxAgeMs = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const queue = await readQueue();
  const cutoff = Date.now() - maxAgeMs;
  const kept = queue.filter((item) => new Date(item.createdAt).getTime() > cutoff);
  const removed = queue.length - kept.length;
  if (removed > 0) {
    await writeQueue(kept);
  }
  return removed;
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

