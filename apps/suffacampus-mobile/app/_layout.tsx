import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { useNetworkSync } from "../hooks/useNetworkSync";

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

  // ─── Network-aware offline queue sync ──────────────────────────────────────
  // Replaces the previous manual AppState listener + setInterval pattern.
  // Handles: foreground detection, periodic flush, and network-aware retry.
  useNetworkSync();

  // -----------------------------------------------------------------------
  // NOTE: expo-notifications setup was removed from the root layout.
  // Push notifications were removed from Expo Go in SDK 53+. The
  // notification handler will be initialized in the notification screens
  // themselves (admin/student/teacher notifications). For production
  // builds (dev-client / standalone), notifications work from those screens.
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!__DEV__) return; // Keep awake only in development
    
    activateKeepAwakeAsync('root-layout').catch((error) => {
      console.warn('Keep awake not available:', error.message);
    });

    return () => {
      deactivateKeepAwake('root-layout');
    };
  }, []);
  
  return <Stack screenOptions={{ headerShown: false }} />;
}

