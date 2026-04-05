import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { getActivities } from "../../services/activityService";

interface ActivityItem {
  id: string;
  type: "Assignment" | "Exam" | "Event" | "Announcement" | "Fee" | "Library" | "Attendance";
  title: string;
  description: string;
  date: string;
  time?: string;
  status?: "pending" | "completed" | "upcoming" | "overdue";
  priority?: "high" | "medium" | "low";
  createdAt?: any;
}

export default function ActivityScreen() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      setLoading(true);

      const items = await getActivities();
      setActivities(items);
    } catch (err) {
      console.warn("Error fetching activities:", err);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchActivities();
    setRefreshing(false);
  };


  const getActivityIcon = (type: string) => {
    switch (type) {
      case "Assignment":
        return { icon: "assignment", color: "#4C6EF5", bg: "#EEF2FF" };
      case "Exam":
        return { icon: "quiz", color: "#EF4444", bg: "#FEE2E2" };
      case "Event":
        return { icon: "event", color: "#10B981", bg: "#D1FAE5" };
      case "Announcement":
        return { icon: "campaign", color: "#F59E0B", bg: "#FEF3C7" };
      case "Fee":
        return { icon: "payments", color: "#EC4899", bg: "#FCE7F3" };
      case "Library":
        return { icon: "local-library", color: "#8B5CF6", bg: "#EDE9FE" };
      case "Attendance":
        return { icon: "how-to-reg", color: "#06B6D4", bg: "#CFFAFE" };
      default:
        return { icon: "info", color: "#6B7280", bg: "#F3F4F6" };
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "completed":
        return "#10B981";
      case "overdue":
        return "#EF4444";
      case "pending":
        return "#F59E0B";
      case "upcoming":
        return "#4C6EF5";
      default:
        return "#6B7280";
    }
  };

  const getPriorityBadge = (priority?: string) => {
    if (!priority || priority === "low") return null;
    
    return (
      <View
        style={[
          styles.priorityBadge,
          { backgroundColor: priority === "high" ? "#FEE2E2" : "#FEF3C7" },
        ]}
      >
        <MaterialCommunityIcons
          name={priority === "high" ? "alert-circle" : "alert"}
          size={12}
          color={priority === "high" ? "#EF4444" : "#F59E0B"}
        />
      </View>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.toDateString() === today.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    if (isToday) return "Today";
    if (isTomorrow) return "Tomorrow";
    
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    });
  };

  const filterActivities = () => {
    if (filterType === "all") return activities;
    return activities.filter((activity) => activity.type === filterType);
  };

  const getActivityCount = (type: string) => {
    if (type === "all") return activities.length;
    return activities.filter((a) => a.type === type).length;
  };

  const renderActivityCard = (item: ActivityItem) => {
    const iconData = getActivityIcon(item.type);
    const statusColor = getStatusColor(item.status);

    return (
      <Card key={item.id} style={styles.activityCard}>
        <View style={styles.cardRow}>
          {/* Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: iconData.bg }]}>
            <MaterialIcons name={iconData.icon as any} size={28} color={iconData.color} />
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={[styles.typeBadge, { backgroundColor: iconData.bg }]}>
                  <Text style={[styles.typeText, { color: iconData.color }]}>{item.type}</Text>
                </View>
                {getPriorityBadge(item.priority)}
              </View>
              <View style={styles.dateContainer}>
                <Text style={styles.dateText}>{formatDate(item.date)}</Text>
                {item.time && <Text style={styles.timeText}>{item.time}</Text>}
              </View>
            </View>
            
            <Text style={styles.activityTitle}>{item.title}</Text>
            
            {item.description && (
              <Text style={styles.activityDescription} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            
            {item.status && (
              <View style={styles.statusContainer}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColor },
                  ]}
                />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    );
  };

  const filters = [
    { key: "all", label: "All", icon: "view-list" },
    { key: "Assignment", label: "Assignments", icon: "assignment" },
    { key: "Exam", label: "Exams", icon: "quiz" },
    { key: "Event", label: "Events", icon: "event" },
    { key: "Fee", label: "Fees", icon: "payments" },
    { key: "Library", label: "Library", icon: "local-library" },
  ];

  const filteredActivities = filterActivities();

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Activity Feed</Text>
          <Text style={styles.headerSubtitle}>Stay updated with latest activities</Text>
        </View>
        <TouchableOpacity onPress={fetchActivities} style={styles.refreshButton}>
          <MaterialCommunityIcons name="refresh" size={24} color="#4C6EF5" />
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
      >
        {filters.map((filter) => {
          const count = getActivityCount(filter.key);
          const isActive = filterType === filter.key;
          
          return (
            <TouchableOpacity
              key={filter.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setFilterType(filter.key)}
            >
              <MaterialIcons
                name={filter.icon as any}
                size={18}
                color={isActive ? "#FFFFFF" : "#6B7280"}
              />
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {filter.label}
              </Text>
              {count > 0 && (
                <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                  <Text style={[styles.countText, isActive && styles.countTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading activities...</Text>
        </View>
      ) : filteredActivities.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="bell-off-outline" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No activities found</Text>
          <Text style={styles.emptySubtext}>
            {filterType === "all" 
              ? "Check back later for updates" 
              : `No ${filterType.toLowerCase()} activities`}
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#4C6EF5"]} />
          }
        >
          {/* Stats Summary */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {activities.filter((a) => a.status === "pending").length}
              </Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {activities.filter((a) => a.status === "upcoming").length}
              </Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {activities.filter((a) => a.priority === "high").length}
              </Text>
              <Text style={styles.statLabel}>High Priority</Text>
            </View>
          </View>

          {/* Activities List */}
          <View style={styles.activitiesSection}>
            <Text style={styles.sectionTitle}>
              {filterType === "all" ? "All Activities" : `${filterType} Activities`}
            </Text>
            {filteredActivities.map(renderActivityCard)}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  filterScroll: {
    marginBottom: 16,
  },
  filterContainer: {
    gap: 8,
    paddingRight: 16,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterChipActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  countBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: "center",
  },
  countBadgeActive: {
    backgroundColor: "#FFFFFF20",
  },
  countText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  countTextActive: {
    color: "#FFFFFF",
  },
  statsContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
  },
  activitiesSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  activityCard: {
    marginBottom: 12,
    elevation: 2,
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priorityBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dateContainer: {
    alignItems: "flex-end",
  },
  dateText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  timeText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    lineHeight: 22,
  },
  activityDescription: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    lineHeight: 20,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9CA3AF",
    marginTop: 8,
  },
});
