import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiFetch } from "./api";

const STORED_PUSH_TOKEN_KEY = "pushToken";

export type PushPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
  status: Notifications.PermissionStatus;
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
  const permissions = await Notifications.getPermissionsAsync();
  return {
    granted: permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    canAskAgain: permissions.canAskAgain,
    status: permissions.status,
  };
}

export async function requestPushPermissionAndRegister(): Promise<{ token: string }> {
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
