import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  Notification,
} from "../../services/notificationService";
import {
  getPushPermissionState,
  requestPushPermissionAndRegister,
} from "../../services/pushNotificationService";

export default function AdminNotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [enablingPush, setEnablingPush] = useState(false);

  const loadNotifications = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const userId = await AsyncStorage.getItem("userId");
      if (!userId) {
        setNotifications([]);
        return;
      }

      const data = await getNotifications({ limit: 100 });
      setNotifications(data);

      const permission = await getPushPermissionState();
      setPermissionGranted(permission.granted);
    } catch (error) {
      console.warn("Error fetching admin notifications:", error);
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(true);
    }, [])
  );

  const markAsRead = async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.warn("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await markAllNotificationsRead({});
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.warn("Error marking all notifications as read:", error);
    }
  };

  const handleEnablePush = async () => {
    try {
      setEnablingPush(true);
      await requestPushPermissionAndRegister();
      setPermissionGranted(true);
    } catch (error) {
      console.warn("Error enabling push notifications:", error);
    } finally {
      setEnablingPush(false);
    }
  };

  const getNotificationRoute = (type: Notification["type"]) => {
    switch (type) {
      case "attendance":
        return "/admin/attendance";
      case "assignment":
      case "result":
        return "/admin/manage-students";
      default:
        return "/admin/dashboard";
    }
  };

  const resolveNotificationRoute = (notification: Notification) => {
    if (notification.actionRoute) {
      return notification.actionRoute;
    }
    return getNotificationRoute(notification.type);
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    const route = resolveNotificationRoute(notification);
    router.push(route as any);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "assignment":
        return "file-document-edit";
      case "result":
        return "chart-line";
      case "attendance":
        return "calendar-check";
      default:
        return "bell";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "assignment":
        return "#4C6EF5";
      case "result":
        return "#10B981";
      case "attendance":
        return "#F59E0B";
      default:
        return "#6366F1";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="bell-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptyText}>You are all caught up.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadNotifications(true)}
              tintColor="#4C6EF5"
            />
          }
        >
          <View style={styles.list}>
            {!permissionGranted && (
              <View style={styles.pushCard}>
                <View style={styles.pushCardIcon}>
                  <MaterialCommunityIcons name="bell-ring-outline" size={20} color="#4C6EF5" />
                </View>
                <View style={styles.pushCardContent}>
                  <Text style={styles.pushCardTitle}>Enable Push Alerts</Text>
                  <Text style={styles.pushCardText}>Receive urgent school-wide updates immediately.</Text>
                </View>
                <TouchableOpacity
                  style={styles.pushEnableButton}
                  onPress={handleEnablePush}
                  disabled={enablingPush}
                >
                  <Text style={styles.pushEnableText}>{enablingPush ? "Enabling..." : "Enable"}</Text>
                </TouchableOpacity>
              </View>
            )}

            {notifications.map((notification) => {
              const iconName = getNotificationIcon(notification.type);
              const color = getNotificationColor(notification.type);

              return (
                <TouchableOpacity
                  key={notification.id}
                  style={[
                    styles.notificationCard,
                    !notification.read && styles.unreadCard,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => handleNotificationPress(notification)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
                    <MaterialCommunityIcons name={iconName as any} size={24} color={color} />
                  </View>
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      {!notification.read && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationTime}>{notification.time}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1F2937",
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  scroll: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  pushCard: {
    backgroundColor: "#EEF2FF",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    marginBottom: 12,
  },
  pushCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  pushCardContent: {
    flex: 1,
  },
  pushCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  pushCardText: {
    fontSize: 12,
    color: "#4B5563",
    marginTop: 2,
  },
  pushEnableButton: {
    backgroundColor: "#4C6EF5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pushEnableText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  notificationCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    marginBottom: 12,
  },
  unreadCard: {
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationContent: {
    flex: 1,
    gap: 6,
  },
  notificationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4C6EF5",
  },
  notificationMessage: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 4,
  },
});
