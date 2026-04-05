import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getTeacherActivities, TeacherActivity } from "../../services/teacherService";

type Activity = TeacherActivity & {
  description?: string;
  timestamp?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

const getActivityIcon = (type: string): string => {
  const icons: Record<string, string> = {
    assignment: "file-document-edit",
    attendance: "calendar-check",
    marks: "clipboard-text",
    result: "chart-line",
    question: "help-circle",
    announcement: "bullhorn",
    class: "school",
    exam: "pencil",
    default: "check-circle",
  };
  return icons[type] || icons.default;
};

const getActivityColor = (type: string): string => {
  const colors: Record<string, string> = {
    assignment: "#4C6EF5",
    attendance: "#10B981",
    marks: "#F59E0B",
    result: "#8B5CF6",
    question: "#EC4899",
    announcement: "#EF4444",
    class: "#06B6D4",
    exam: "#F97316",
    default: "#64748B",
  };
  return colors[type] || colors.default;
};

const formatTimeAgo = (timestamp: string): string => {
  const now = new Date();
  const time = new Date(timestamp);
  const diff = now.getTime() - time.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  
  return time.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function ActivityScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<"all" | string>("all");

  const activityTypes = [
    { key: "all", label: "All" },
    { key: "assignment", label: "Assignments" },
    { key: "attendance", label: "Attendance" },
    { key: "marks", label: "Marks" },
    { key: "result", label: "Results" },
    { key: "question", label: "Questions" },
  ];

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const teacherId = await AsyncStorage.getItem("userId");
      if (!teacherId) { router.replace("/login" as any); return; }
      const list = await getTeacherActivities({ teacherId });
      setActivities(list);
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

  const getFilteredActivities = () => {
    if (filterType === "all") return activities;
    return activities.filter(a => a.type === filterType);
  };

  const filteredActivities = getFilteredActivities();

  const groupActivitiesByDate = (activities: Activity[]) => {
    const groups: Record<string, Activity[]> = {};
    
    activities.forEach(activity => {
      const timestamp = (activity as Activity).timestamp;
      const date = timestamp ? new Date(timestamp) : new Date();
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let groupKey = "";
      if (date.toDateString() === today.toDateString()) {
        groupKey = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = "Yesterday";
      } else {
        groupKey = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(activity);
    });
    
    return groups;
  };

  const groupedActivities = groupActivitiesByDate(filteredActivities);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recent Activity</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <MaterialCommunityIcons name="refresh" size={24} color="#4C6EF5" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScrollView}
        contentContainerStyle={styles.filterContainer}
      >
        {activityTypes.map((type) => (
          <TouchableOpacity
            key={type.key}
            style={[
              styles.filterTab,
              filterType === type.key && styles.filterTabActive,
            ]}
            onPress={() => setFilterType(type.key)}
          >
            <Text
              style={[
                styles.filterText,
                filterType === type.key && styles.filterTextActive,
              ]}
            >
              {type.label}
            </Text>
            {type.key !== "all" && (
              <View style={[
                styles.filterBadge,
                filterType === type.key && styles.filterBadgeActive,
              ]}>
                <Text style={[
                  styles.filterBadgeText,
                  filterType === type.key && styles.filterBadgeTextActive,
                ]}>
                  {activities.filter(a => a.type === type.key).length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Activities List */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#4C6EF5"]} />
        }
      >
        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading activities...</Text>
          </View>
        ) : filteredActivities.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="history" size={64} color="#CBD5E1" />
            <Text style={styles.emptyText}>No activities found</Text>
            <Text style={styles.emptySubtext}>Your recent actions will appear here</Text>
          </View>
        ) : (
          Object.keys(groupedActivities).map((dateGroup) => (
            <View key={dateGroup} style={styles.dateGroup}>
              <View style={styles.dateHeader}>
                <View style={styles.dateLine} />
                <Text style={styles.dateText}>{dateGroup}</Text>
                <View style={styles.dateLine} />
              </View>
              
              {groupedActivities[dateGroup].map((activity, index) => (
                <TouchableOpacity
                  key={activity.id}
                  style={styles.activityCard}
                  activeOpacity={0.7}
                >
                  <View style={styles.activityCardContent}>
                    <View style={[styles.activityIconCircle, { backgroundColor: `${activity.color}15` }]}>
                      <MaterialCommunityIcons
                        name={activity.icon as any}
                        size={24}
                        color={activity.color}
                      />
                    </View>
                    
                    <View style={styles.activityDetails}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      {activity.description && (
                        <Text style={styles.activityDescription} numberOfLines={2}>
                          {activity.description}
                        </Text>
                      )}
                      
                      {activity.metadata && (
                        <View style={styles.metadataRow}>
                          {activity.metadata.class && (
                            <View style={styles.metadataTag}>
                              <MaterialCommunityIcons name="school" size={12} color="#64748B" />
                              <Text style={styles.metadataText}>{activity.metadata.class}</Text>
                            </View>
                          )}
                          {activity.metadata.count && (
                            <View style={styles.metadataTag}>
                              <MaterialCommunityIcons name="account-group" size={12} color="#64748B" />
                              <Text style={styles.metadataText}>{activity.metadata.count} items</Text>
                            </View>
                          )}
                          {activity.metadata.subject && (
                            <View style={styles.metadataTag}>
                              <MaterialCommunityIcons name="book-open-variant" size={12} color="#64748B" />
                              <Text style={styles.metadataText}>{activity.metadata.subject}</Text>
                            </View>
                          )}
                        </View>
                      )}
                      
                      <View style={styles.activityTimeRow}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color="#94A3B8" />
                        <Text style={styles.activityTime}>{activity.time}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1E293B", flex: 1, textAlign: "center", marginHorizontal: 16 },
  refreshButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  filterScrollView: { backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  filterContainer: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterTab: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#F8FAFC", gap: 6 },
  filterTabActive: { backgroundColor: "#4C6EF5" },
  filterText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  filterTextActive: { color: "#FFFFFF" },
  filterBadge: { backgroundColor: "#E2E8F0", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, minWidth: 20, alignItems: "center" },
  filterBadgeActive: { backgroundColor: "#FFFFFF" },
  filterBadgeText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  filterBadgeTextActive: { color: "#4C6EF5" },
  content: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#64748B", marginTop: 16 },
  emptySubtext: { fontSize: 14, color: "#94A3B8", marginTop: 8 },
  dateGroup: { marginBottom: 24 },
  dateHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 12, marginTop: 12 },
  dateLine: { flex: 1, height: 1, backgroundColor: "#E2E8F0" },
  dateText: { fontSize: 13, fontWeight: "700", color: "#64748B", paddingHorizontal: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  activityCard: { backgroundColor: "#FFFFFF", marginHorizontal: 20, marginBottom: 12, borderRadius: 16, padding: 16, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  activityCardContent: { flexDirection: "row", alignItems: "flex-start" },
  activityIconCircle: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 12 },
  activityDetails: { flex: 1 },
  activityTitle: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  activityDescription: { fontSize: 14, color: "#64748B", marginBottom: 8, lineHeight: 20 },
  metadataRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  metadataTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F8FAFC", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metadataText: { fontSize: 12, fontWeight: "500", color: "#64748B" },
  activityTimeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  activityTime: { fontSize: 13, fontWeight: "500", color: "#94A3B8" },
});
