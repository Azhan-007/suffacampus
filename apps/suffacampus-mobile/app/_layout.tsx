import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from "expo-notifications";
import { Stack, router } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, AppState, AppStateStatus } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { flushOfflineQueue } from '../services/offlineSyncQueue';

/**
 * Expo Router ErrorBoundary — catches unhandled JS errors per route.
 * Prevents the entire app from white-screening.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={ebStyles.container}>
      <Text style={ebStyles.icon}>⚠️</Text>
      <Text style={ebStyles.title}>Something went wrong</Text>
      <Text style={ebStyles.message}>{error.message}</Text>
      <TouchableOpacity style={ebStyles.retryBtn} onPress={retry}>
        <Text style={ebStyles.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

const ebStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F8FAFC" },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#1E293B", marginBottom: 8 },
  message: { fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  retryBtn: { backgroundColor: "#4C6EF5", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: "#FFF", fontWeight: "600", fontSize: 16 },
});

export default function RootLayout() {
  useAuth();
  
  const appState = useRef(AppState.currentState);
  const periodicTimerRef = useRef<number | null>(null);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const triggerActionUrl =
        (response.notification.request.trigger as any)?.payload?.data?.actionUrl;
      const actionUrl =
        response.notification.request.content.data?.actionUrl ?? triggerActionUrl;

      if (typeof actionUrl === "string" && actionUrl.startsWith("/")) {
        router.push(actionUrl as any);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!__DEV__) return; // Keep awake only in development
    
    // Activate keep awake with error handling
    activateKeepAwakeAsync('root-layout').catch((error) => {
      console.warn('Keep awake not available:', error.message);
    });

    return () => {
      deactivateKeepAwake('root-layout');
    };
  }, []);

  useEffect(() => {
    /**
     * AppState listener: Flush offline queue when app comes to foreground.
     * This ensures queued mutations are retried as soon as the user reopens the app.
     */
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to foreground
        console.log('[AppState] App foreground: flushing offline queue');
        try {
          await flushOfflineQueue();
        } catch (error) {
          console.warn('[AppState] Offline queue flush failed:', error);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    /**
     * Periodic timer: Flush offline queue every 30 seconds.
     * Helps ensure queued mutations are retried even if the app stays in background.
     */
    const timer = setInterval(async () => {
      try {
        await flushOfflineQueue();
      } catch (error) {
        console.warn('[PeriodicFlush] Offline queue flush failed:', error);
      }
    }, 30_000); // 30 seconds

    periodicTimerRef.current = timer as any;

    return () => {
      if (periodicTimerRef.current !== null) {
        clearInterval(periodicTimerRef.current);
      }
    };
  }, []);
  
  return <Stack screenOptions={{ headerShown: false }} />;
}
