import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import Section from "../../components/Section";
import { apiFetch } from "../../services/api";

type MenuItem = {
  icon: string;
  label: string;
  route: string;
  color: string;
  badge?: string;
};

export default function MenuScreen() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const data = await apiFetch<{ unreadCount: number }>("/notifications/unread-count");
        setUnreadCount(data.unreadCount ?? 0);
      } catch {
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
  }, []);

  const academicItems: MenuItem[] = [
    { icon: "calendar-clock", label: "Timetable", route: "/student/timetable", color: "#4C6EF5" },
    { icon: "file-document-outline", label: "Assignments", route: "/student/assignments", color: "#F59E0B" },
    { icon: "chart-line", label: "Results", route: "/student/results", color: "#10B981" },
    { icon: "head-question-outline", label: "Question Bank", route: "/student/question-bank", color: "#8B5CF6" },
  ];

  const servicesItems: MenuItem[] = [
    { icon: "calendar-check", label: "Attendance", route: "/student/attendance", color: "#EC4899" },
    { icon: "library-shelves", label: "Library", route: "/student/library", color: "#06B6D4" },
    { icon: "credit-card-outline", label: "Fees", route: "/student/fees", color: "#F97316" },
    {
      icon: "bell-outline",
      label: "Notifications",
      route: "/student/notifications",
      color: "#6366F1",
      badge: unreadCount > 0 ? `${unreadCount > 99 ? "99+" : unreadCount} New` : "Updates",
    },
    { icon: "clock-outline", label: "Activity", route: "/student/activity", color: "#6366F1" },
  ];

  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>All Services</Text>
            <Text style={styles.headerSubtitle}>Quick access to all features</Text>
          </View>

          {/* Academic Section */}
          <Section title="Academic">
            <Card style={styles.sectionCard}>
              {academicItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => router.push(item.route as any)}
                  style={[
                    styles.menuItem,
                    index < academicItems.length - 1 && styles.menuItemBorder
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuRow}>
                    <View style={[styles.iconCircle, { backgroundColor: `${item.color}15` }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {!!item.badge && <Text style={styles.menuBadge}>{item.badge}</Text>}
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          </Section>

          {/* Services Section */}
          <Section title="Services">
            <Card style={styles.sectionCard}>
              {servicesItems.map((item, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => router.push(item.route as any)}
                  style={[
                    styles.menuItem,
                    index < servicesItems.length - 1 && styles.menuItemBorder
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuRow}>
                    <View style={[styles.iconCircle, { backgroundColor: `${item.color}15` }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
                    </View>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          </Section>

        </ScrollView>
      </View>

      {/* PREMIUM FLOATING BOTTOM NAVIGATION */}
      <SafeAreaView edges={["bottom"]} style={styles.floatingNavContainer}>
        <View style={styles.floatingNav}>
          {/* Home (inactive) */}
          <Pressable style={styles.navItem} onPress={() => router.push('/student/dashboard' as any)}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="home-outline" size={24} color="#D1D5DB" />
              </View>
            )}
          </Pressable>
          {/* Grid (active) */}
          <Pressable style={styles.navItemActive} onPress={() => {}}>
            {({ pressed }) => (
              <View style={[styles.activeNavFilled, { opacity: pressed ? 0.6 : 1 }]}> 
                <MaterialCommunityIcons name="view-grid" size={24} color="#FFFFFF" />
                <Text style={styles.navLabelActive}>Menu</Text>
              </View>
            )}
          </Pressable>
          {/* Account (inactive) */}
          <Pressable style={styles.navItem} onPress={() => router.push('/student/profile' as any)}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="account-outline" size={24} color="#D1D5DB" />
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  mainContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#94A3B8",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  menuItem: {
    paddingVertical: 12,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  menuBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4C6EF5",
    backgroundColor: "#E0E7FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  floatingNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 0,
  },
  floatingNav: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    elevation: 0,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    height: 60,
  },
  navItemActive: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  activeNavFilled: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#4C6EF5",
    gap: 8,
  },
  navLabelActive: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
