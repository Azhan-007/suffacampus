import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiFetch } from "./api";

// ---------------------------------------------------------------------------
// expo-notifications is loaded lazily (inside each function) because its
// module-level side-effects throw in Expo Go on SDK 53+. This makes the
// service safe to import from route files that expo-router eagerly loads
// during startup, while still working in production/dev-client builds.
// ---------------------------------------------------------------------------

type NotificationsModule = typeof import("expo-notifications");

function getNotifications(): NotificationsModule {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("expo-notifications") as NotificationsModule;
}

const STORED_PUSH_TOKEN_KEY = "pushToken";

export type PushPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
};

function getProjectId(): string | undefined {
  const expoProjectId = (Constants.expoConfig?.extra as any)?.eas?.projectId as string | undefined;
  const easProjectId = (Constants as any).easConfig?.projectId as string | undefined;
  return easProjectId ?? expoProjectId;
}

function getPlatform(): "web" | "android" | "ios" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  const Notifications = getNotifications();
  const permissions = await Notifications.getPermissionsAsync();
  return {
    granted: permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    canAskAgain: permissions.canAskAgain,
    status: permissions.status,
  };
}

export async function requestPushPermissionAndRegister(): Promise<{ token: string }> {
  const Notifications = getNotifications();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4C6EF5",
    });
  }

  const current = await getPushPermissionState();
  let granted = current.granted;

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }

  if (!granted) {
    throw new Error("Push notification permission not granted.");
  }

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Missing Expo projectId in app config.");
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResponse.data;

  await apiFetch("/notifications/push/register", {
    method: "POST",
    body: {
      token,
      platform: getPlatform(),
      deviceInfo: `${Platform.OS} ${String(Platform.Version)}`,
    },
  });

  await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, token);
  return { token };
}

export async function unregisterPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  if (!token) return;

  await apiFetch("/notifications/push/unregister", {
    method: "DELETE",
    body: { token },
  });

  await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
}

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
}
