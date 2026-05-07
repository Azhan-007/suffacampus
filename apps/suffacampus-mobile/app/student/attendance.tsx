import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import Section from "../../components/Section";
import { getStudentAttendanceHistory } from "../../services/attendanceService";

interface AttendanceRecord {
  date: string;
  status: "Present" | "Absent" | "Late" | "Excused";
  session?: "FN" | "AN";
}

interface AttendanceStats {
  todayFN: "Present" | "Absent" | "Late" | "Excused" | "Not Marked";
  todayAN: "Present" | "Absent" | "Late" | "Excused" | "Not Marked";
  monthlyPercentage: number;
  totalPercentage: number;
  totalPresent: number;
  totalDays: number;
}

export default function AttendanceScreen() {
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      setLoading(true);

      const currentStudentId = await AsyncStorage.getItem("studentId");
      if (!currentStudentId) { router.replace("/login" as any); return; }

      const { records, stats: serverStats } = await getStudentAttendanceHistory(currentStudentId);

      // Use server-computed stats and augment with today/monthly info from records
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      // Normalize backend date (could be ISO DateTime "2026-04-25T00:00:00.000Z" or date-only)
      const normDate = (d: string) => d ? d.split("T")[0] : "";

      // Find today's records (normalize both sides for comparison)
      const todayRecords = records.filter((r: any) => normDate(r.date) === todayStr);
      
      // Backend stores a single attendance record per day (no FN/AN session split).
      // Map the single record to the Forenoon card; Afternoon shows the same or "Not Marked".
      let todayFN: string = "Not Marked";
      let todayAN: string = "Not Marked";

      if (todayRecords.length > 0) {
        const fnRecord = todayRecords.find((r: any) => r.session === "FN");
        const anRecord = todayRecords.find((r: any) => r.session === "AN");
        
        if (fnRecord || anRecord) {
          // Backend supports sessions — use them directly
          todayFN = fnRecord?.status || "Not Marked";
          todayAN = anRecord?.status || "Not Marked";
        } else {
          // Single record per day — show status in both cards
          todayFN = todayRecords[0].status;
          todayAN = todayRecords[0].status;
        }
      }

      // Monthly stats
      const monthlyRecords = records.filter((r: any) => {
        const d = new Date(r.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
      const monthlyPresent = monthlyRecords.filter((r: any) => r.status === "Present" || r.status === "Late").length;
      const monthlyTotal = monthlyRecords.length;
      const monthlyPercentage = monthlyTotal > 0 ? Math.round((monthlyPresent / monthlyTotal) * 100) : 0;

      setStats({
        todayFN: todayFN as any,
        todayAN: todayAN as any,
        monthlyPercentage,
        totalPercentage: serverStats.percentage,
        totalPresent: serverStats.present,
        totalDays: serverStats.total,
      });
    } catch (err) {
      console.warn("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const s = (status || "").trim();
    if (s === "Present") return "#10B981";
    if (s === "Absent") return "#EF4444";
    if (s === "Late") return "#F59E0B";
    if (s === "Excused") return "#3B82F6";
    return "#6B7280";
  };

  const getStatusIcon = (status: string) => {
    const s = (status || "").trim();
    if (s === "Present") return "check-circle";
    if (s === "Absent") return "cancel";
    if (s === "Late") return "access-time";
    if (s === "Excused") return "info";
    return "help-outline";
  };

  const renderSessionCard = (title: string, session: "FN" | "AN", status: string) => {
    const statusColor = getStatusColor(status);
    const statusIcon = getStatusIcon(status);

    return (
      <Card style={styles.sessionCard}>
        <View style={styles.sessionContent}>
          <View style={[styles.sessionIconCircle, { backgroundColor: `${statusColor}15` }]}>
            <MaterialIcons name={statusIcon as any} size={32} color={statusColor} />
          </View>
          <Text style={styles.sessionTitle}>{title}</Text>
          <Text style={styles.sessionLabel}>{session}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
          </View>
        </View>
      </Card>
    );
  };

  const renderPercentageCard = (title: string, percentage: number, subtitle?: string) => {
    const color = percentage >= 75 ? "#10B981" : percentage >= 50 ? "#F59E0B" : "#EF4444";

    return (
      <Card style={styles.percentageCard}>
        <View style={styles.percentageContent}>
          <MaterialIcons name="assessment" size={28} color={color} />
          <Text style={styles.percentageValue}>{percentage}%</Text>
          <Text style={styles.percentageTitle}>{title}</Text>
          {subtitle && <Text style={styles.percentageSubtitle}>{subtitle}</Text>}
        </View>
      </Card>
    );
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading attendance...</Text>
        </View>
      ) : !stats ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="event-busy" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No attendance data available</Text>
        </View>
      ) : (
        <>
          {/* Today's Sessions */}
          <Section title="Today's Attendance">
            <View style={styles.todayGrid}>
              {renderSessionCard("Forenoon", "FN", stats.todayFN)}
              {renderSessionCard("Afternoon", "AN", stats.todayAN)}
            </View>
          </Section>

          {/* Overall Stats */}
          <Section title="Overall Statistics">
            <View style={styles.statsGrid}>
              {renderPercentageCard(
                "Monthly Attendance",
                stats.monthlyPercentage,
                "Current Month"
              )}
              {renderPercentageCard(
                "Total Attendance",
                stats.totalPercentage,
                `${stats.totalPresent}/${stats.totalDays} Sessions`
              )}
            </View>
          </Section>
        </>
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
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  todayGrid: {
    flexDirection: "row",
    gap: 12,
  },
  sessionCard: {
    flex: 1,
    elevation: 4,
  },
  sessionContent: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  sessionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  percentageCard: {
    flex: 1,
    elevation: 4,
  },
  percentageContent: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  percentageValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  percentageTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
  },
  percentageSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
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
});
