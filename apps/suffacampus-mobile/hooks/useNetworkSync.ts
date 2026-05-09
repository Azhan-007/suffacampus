/**
 * useNetworkSync.ts — Network-aware offline queue flush.
 *
 * Monitors connectivity and flushes the offline mutation queue when
 * the device regains network access. Also provides an `isOnline`
 * boolean for UI feedback.
 *
 * Uses a lightweight fetch-based connectivity check (no extra deps).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { flushOfflineQueue, getOfflineQueueSize } from "../services/offlineSyncQueue";

const CONNECTIVITY_CHECK_URL = "https://clients3.google.com/generate_204";
const CONNECTIVITY_CHECK_TIMEOUT_MS = 5_000;
const PERIODIC_FLUSH_INTERVAL_MS = 30_000;

/**
 * Probe network connectivity by issuing a tiny HEAD request.
 * Returns true if the device can reach the internet.
 */
async function checkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECTIVITY_CHECK_TIMEOUT_MS);

    const response = await fetch(CONNECTIVITY_CHECK_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timer);
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

interface UseNetworkSyncReturn {
  /** Whether the device currently has internet connectivity. */
  isOnline: boolean;
  /** Number of items pending in the offline queue. */
  pendingCount: number;
  /** Whether a flush is currently in progress. */
  isSyncing: boolean;
  /** Manually trigger a queue flush. */
  syncNow: () => Promise<{ flushed: number; remaining: number }>;
  /** Refresh the pending count from AsyncStorage. */
  refreshPendingCount: () => Promise<void>;
}

export function useNetworkSync(): UseNetworkSyncReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasOfflineRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getOfflineQueueSize();
      if (isMountedRef.current) setPendingCount(count);
    } catch {
      // Non-critical — don't crash
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (isSyncing) return { flushed: 0, remaining: pendingCount };

    setIsSyncing(true);
    try {
      const result = await flushOfflineQueue();
      if (isMountedRef.current) {
        setPendingCount(result.remaining);
      }
      return result;
    } catch (error) {
      console.warn("[NetworkSync] Flush failed:", error);
      return { flushed: 0, remaining: pendingCount };
    } finally {
      if (isMountedRef.current) setIsSyncing(false);
    }
  }, [isSyncing, pendingCount]);

  // Periodic connectivity check + flush
  useEffect(() => {
    isMountedRef.current = true;

    const checkAndFlush = async () => {
      const online = await checkConnectivity();
      if (!isMountedRef.current) return;

      const wasOffline = wasOfflineRef.current;
      wasOfflineRef.current = !online;
      setIsOnline(online);

      if (online && (wasOffline || pendingCount > 0)) {
        console.log("[NetworkSync] Online — flushing queue");
        await syncNow();
      }

      await refreshPendingCount();
    };

    // Initial check
    void checkAndFlush();

    // Periodic check
    const intervalId = setInterval(checkAndFlush, PERIODIC_FLUSH_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        console.log("[NetworkSync] App foreground — checking connectivity");
        const online = await checkConnectivity();
        if (isMountedRef.current) {
          setIsOnline(online);
          if (online) {
            await syncNow();
          }
          await refreshPendingCount();
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [syncNow, refreshPendingCount]);

  return { isOnline, pendingCount, isSyncing, syncNow, refreshPendingCount };
}
