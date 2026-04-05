import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useRootNavigationState, useSegments } from "expo-router";
import { useEffect, useState } from "react";

export function useAuth() {
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!navigationState?.key || hasChecked) return;

    (async () => {
      try {
        const role = await AsyncStorage.getItem("role");
        const currentPath = (segments as string[]).join("/");
        
        if (!role) {
          // Not logged in - redirect to login only if not already there
          if (currentPath !== "login" && !currentPath.includes("/login")) {
            router.replace("/login" as any);
          }
        } else if (role === "student") {
          // Logged in as student
          if (!currentPath.includes("student")) {
            router.replace("/student/dashboard" as any);
          }
        } else if (role === "teacher") {
          // Logged in as teacher
          if (!currentPath.includes("teacher")) {
            router.replace("/teacher/dashboard" as any);
          }
        } else if (role === "admin" || role === "Admin" || role === "Principal" || role === "SuperAdmin") {
          // Logged in as admin/principal/superadmin
          if (!currentPath.includes("admin")) {
            router.replace("/admin/dashboard" as any);
          }
        }
        
        setHasChecked(true);
      } catch (error) {
        console.error("Auth check error:", error);
        setHasChecked(true);
      }
    })();
  }, [navigationState?.key, segments, hasChecked]);
}
