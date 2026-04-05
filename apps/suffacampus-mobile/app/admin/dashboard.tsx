import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { auth } from "../../firebase";
import { apiFetch } from "../../services/api";

export default function AdminDashboard() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUnreadCount();
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const data = await apiFetch<{ unreadCount: number }>("/notifications/unread-count");
      setUnreadCount(data.unreadCount);
    } catch {
      // Ignore — badge just stays at 0
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            await auth.signOut();
            await AsyncStorage.multiRemove([
              "role", "userEmail", "userName", "username",
              "userId", "schoolId", "schoolCode", "schoolName", "studentId", "classId",
            ]);
            router.replace("/school-select" as any);
          } catch (error) {
            console.warn("Logout error:", error);
          }
        },
      },
    ]);
  };

  const quickActions = [
    {
      title: "Manage Teachers",
      icon: "account-group",
      color: "#4C6EF5",
      route: "/admin/manage-teachers",
      badge: "Teachers",
    },
    {
      title: "Manage Students",
      icon: "school",
      color: "#10B981",
      route: "/admin/manage-students",
      badge: "Students",
    },
    {
      title: "Attendance",
      icon: "calendar-check",
      color: "#06B6D4",
      route: "/admin/attendance",
      badge: "Track",
    },
    {
      title: "Fees",
      icon: "cash-multiple",
      color: "#F97316",
      route: "/admin/fees",
      badge: "Collect",
    },
    {
      title: "Timetable",
      icon: "calendar-clock",
      color: "#F59E0B",
      route: "/admin/timetable",
      badge: "Schedule",
    },
    {
      title: "Events",
      icon: "calendar-star",
      color: "#8B5CF6",
      route: "/admin/events",
      badge: "Manage",
    },
    {
      title: "Library",
      icon: "book-open-variant",
      color: "#EC4899",
      route: "/admin/library",
      badge: "Books",
    },
    {
      title: "Carousel",
      icon: "view-carousel",
      color: "#EF4444",
      route: "/admin/carousel",
      badge: "Config",
    },
    {
      title: "Summary Config",
      icon: "cog",
      color: "#64748B",
      route: "/admin/summary-config",
      badge: "Settings",
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome Admin!</Text>
          <Text style={styles.subtitle}>Manage your school</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => router.push("/admin/notifications" as any)}
        >
          <MaterialCommunityIcons name="bell" size={24} color="#1E293B" />
          {unreadCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.grid}>
            {quickActions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.actionCard}
                onPress={() => router.push(action.route as any)}
              >
                <Card style={styles.card}>
                  <View style={[styles.iconCircle, { backgroundColor: `${action.color}15` }]}>
                    <MaterialCommunityIcons name={action.icon as any} size={32} color={action.color} />
                  </View>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                  <View style={[styles.badge, { backgroundColor: `${action.color}15` }]}>
                    <Text style={[styles.badgeText, { color: action.color }]}>{action.badge}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={22} color="#EF4444" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 4,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notificationBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  scroll: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  actionCard: {
    width: "47%",
  },
  card: {
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#EF4444",
  },
});
