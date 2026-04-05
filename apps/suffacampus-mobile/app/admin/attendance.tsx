import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { getAttendanceByClassDate, getStudentsByClass, type ClassAttendanceRecord, type StudentRecord } from "../../services/attendanceService";
import { apiFetch } from "../../services/api";

interface AttendanceStats {
  class: string;
  totalStudents: number;
  presentToday: number;
  absentToday: number;
  leaveToday: number;
  averageAttendance: number;
}

interface StudentAttendanceDetail {
  studentId: string;
  studentName: string;
  class: string;
  rollNumber: string;
  totalDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  percentage: number;
}

export default function AdminAttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<"overview" | "class" | "students">("overview");
  const [selectedClass, setSelectedClass] = useState<string>("All");
  const [selectedDateRange, setSelectedDateRange] = useState<"today" | "week" | "month">("today");
  const [classStats, setClassStats] = useState<AttendanceStats[]>([]);
  const [studentDetails, setStudentDetails] = useState<StudentAttendanceDetail[]>([]);
  const [classes, setClasses] = useState<string[]>(["All"]);

  const exportAttendanceCSV = async () => {
    try {
      if (studentDetails.length === 0) {
        Alert.alert("No Data", "No attendance data available to export.");
        return;
      }

      const header = "Student Name,Class,Roll Number,Total Days,Present,Absent,Leave,Percentage";
      const rows = studentDetails.map(
        (s) =>
          `"${s.studentName}","${s.class}","${s.rollNumber}",${s.totalDays},${s.presentDays},${s.absentDays},${s.leaveDays},${s.percentage.toFixed(1)}%`
      );
      const csv = [header, ...rows].join("\n");

      await Share.share({
        message: csv,
        title: `Attendance Report - ${new Date().toLocaleDateString()}`,
      });
    } catch (error) {
      console.warn("Error exporting attendance:", error);
      Alert.alert("Export Failed", "Unable to export attendance data.");
    }
  };

  const dateRanges = [
    { value: "today", label: "Today" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
  ];

  useEffect(() => {
    fetchAttendanceData();
  }, [selectedClass, selectedDateRange]);

  const fetchAttendanceData = async () => {
    try {
      setLoading(true);

      // 1. Fetch class list from backend
      const classesData = await apiFetch<Array<{ id: string; name: string; sections?: string[] }>>("/classes");
      const classNames = classesData.map(c => c.name);
      setClasses(["All", ...classNames]);

      // 2. Fetch today's attendance per class and aggregate
      const today = new Date().toISOString().split("T")[0];
      const classStatsArr: AttendanceStats[] = [];
      const studentDetailsArr: StudentAttendanceDetail[] = [];

      for (const classItem of classesData) {
        const className = classItem.name;
        const classId = classItem.id;
        const sectionId = classItem.sections?.[0] || "A"; // Use first section or default
        

        const [students, classRecords] = await Promise.all([
          getStudentsByClass(classId, sectionId),
          getAttendanceByClassDate(classId, sectionId, today),
        ]);

        const presentCount = classRecords.filter(r => r.status === "Present").length;
        const absentCount = classRecords.filter(r => r.status === "Absent").length;
        const total = students.length;
        const avgAttendance = total > 0 ? (presentCount / total) * 100 : 0;

        classStatsArr.push({
          class: className,
          totalStudents: total,
          presentToday: presentCount,
          absentToday: absentCount,
          leaveToday: Math.max(0, total - presentCount - absentCount),
          averageAttendance: avgAttendance,
        });

        // Build student detail records
        for (const student of students) {
          const studentRecords = classRecords.filter(r => r.studentId === student.id);
          const present = studentRecords.filter(r => r.status === "Present").length;
          const absent = studentRecords.filter(r => r.status === "Absent").length;
          const totalDays = Math.max(present + absent, 1);

          studentDetailsArr.push({
            studentId: student.id,
            studentName: student.name,
            class: className,
            rollNumber: student.rollNo || "-",
            totalDays,
            presentDays: present,
            absentDays: absent,
            leaveDays: 0,
            percentage: totalDays > 0 ? (present / totalDays) * 100 : 0,
          });
        }
      }

      setClassStats(classStatsArr);
      setStudentDetails(studentDetailsArr);
    } catch (error) {
      console.warn("Error fetching attendance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 90) return "#10B981";
    if (percentage >= 75) return "#F59E0B";
    return "#EF4444";
  };

  const formatDate = (dateString: string) => {
    const date = new Date();
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const totalStudents = classStats.reduce((sum, stat) => sum + stat.totalStudents, 0);
  const totalPresent = classStats.reduce((sum, stat) => sum + stat.presentToday, 0);
  const totalAbsent = classStats.reduce((sum, stat) => sum + stat.absentToday, 0);
  const totalLeave = classStats.reduce((sum, stat) => sum + stat.leaveToday, 0);
  const overallPercentage = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : "0.0";

  const filteredClassStats = selectedClass === "All" 
    ? classStats 
    : classStats.filter(stat => stat.class === selectedClass);

  const filteredStudentDetails = selectedClass === "All"
    ? studentDetails
    : studentDetails.filter(student => student.class === selectedClass);

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      {/* Overall Stats */}
      <Card style={styles.overallCard}>
        <View style={styles.overallHeader}>
          <MaterialCommunityIcons name="chart-box" size={28} color="#4C6EF5" />
          <Text style={styles.overallTitle}>Overall Attendance</Text>
        </View>
        
        <View style={styles.overallStats}>
          <View style={styles.overallStatItem}>
            <Text style={styles.overallStatNumber}>{totalPresent}</Text>
            <Text style={styles.overallStatLabel}>Present</Text>
          </View>
          <View style={styles.overallStatDivider} />
          <View style={styles.overallStatItem}>
            <Text style={styles.overallStatNumber}>{totalAbsent}</Text>
            <Text style={styles.overallStatLabel}>Absent</Text>
          </View>
          <View style={styles.overallStatDivider} />
          <View style={styles.overallStatItem}>
            <Text style={styles.overallStatNumber}>{totalLeave}</Text>
            <Text style={styles.overallStatLabel}>Leave</Text>
          </View>
        </View>

        <View style={styles.percentageContainer}>
          <LinearGradient
            colors={["#10B981", "#14B8A6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.percentageGradient}
          >
            <Text style={styles.percentageNumber}>{overallPercentage}%</Text>
            <Text style={styles.percentageLabel}>Attendance Rate</Text>
          </LinearGradient>
        </View>
      </Card>

      {/* Class-wise Stats */}
      <Text style={styles.sectionTitle}>Class-wise Attendance</Text>
      {filteredClassStats.map((stat) => (
        <Card key={stat.class} style={styles.classCard}>
          <View style={styles.classHeader}>
            <View style={styles.classInfo}>
              <View style={styles.classBadge}>
                <MaterialCommunityIcons name="google-classroom" size={20} color="#4C6EF5" />
                <Text style={styles.className}>Class {stat.class}</Text>
              </View>
              <Text style={styles.classStudentCount}>{stat.totalStudents} students</Text>
            </View>

            <View style={[styles.classPercentageBadge, { backgroundColor: getPercentageColor(stat.averageAttendance) + '15' }]}>
              <Text style={[styles.classPercentage, { color: getPercentageColor(stat.averageAttendance) }]}>
                {stat.averageAttendance.toFixed(1)}%
              </Text>
            </View>
          </View>

          <View style={styles.classStatsRow}>
            <View style={styles.classStatItem}>
              <View style={[styles.classStatIcon, { backgroundColor: "#D1FAE5" }]}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#10B981" />
              </View>
              <Text style={styles.classStatNumber}>{stat.presentToday}</Text>
              <Text style={styles.classStatLabel}>Present</Text>
            </View>

            <View style={styles.classStatItem}>
              <View style={[styles.classStatIcon, { backgroundColor: "#FEE2E2" }]}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#EF4444" />
              </View>
              <Text style={styles.classStatNumber}>{stat.absentToday}</Text>
              <Text style={styles.classStatLabel}>Absent</Text>
            </View>

            <View style={styles.classStatItem}>
              <View style={[styles.classStatIcon, { backgroundColor: "#FEF3C7" }]}>
                <MaterialCommunityIcons name="clock" size={16} color="#F59E0B" />
              </View>
              <Text style={styles.classStatNumber}>{stat.leaveToday}</Text>
              <Text style={styles.classStatLabel}>Leave</Text>
            </View>
          </View>

          <TouchableOpacity 
            style={styles.viewDetailsButton}
            onPress={() => {
              setSelectedClass(stat.class);
              setSelectedView("students");
            }}
          >
            <Text style={styles.viewDetailsText}>View Details</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color="#4C6EF5" />
          </TouchableOpacity>
        </Card>
      ))}
    </View>
  );

  const renderStudentDetails = () => (
    <View style={styles.studentsContainer}>
      <Text style={styles.sectionTitle}>
        {selectedClass === "All" ? "All Students" : "Class " + selectedClass + " Students"}
      </Text>
      
      {filteredStudentDetails.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-group" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No attendance records found</Text>
        </View>
      ) : (
        filteredStudentDetails.map((student) => {
          const percentageColor = getPercentageColor(student.percentage);
          
          return (
            <Card key={student.studentId} style={styles.studentCard}>
              <View style={styles.studentHeader}>
                <View style={styles.studentInfo}>
                  <View style={styles.rollBadge}>
                    <Text style={styles.rollNumber}>{student.rollNumber}</Text>
                  </View>
                  <View style={styles.nameContainer}>
                    <Text style={styles.studentName}>{student.studentName}</Text>
                    <Text style={styles.studentClass}>Class {student.class}</Text>
                  </View>
                </View>

                <View style={[styles.studentPercentageBadge, { backgroundColor: percentageColor + '15' }]}>
                  <Text style={[styles.studentPercentage, { color: percentageColor }]}>
                    {student.percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>

              <View style={styles.studentStatsRow}>
                <View style={styles.studentStatItem}>
                  <Text style={styles.studentStatNumber}>{student.totalDays}</Text>
                  <Text style={styles.studentStatLabel}>Total Days</Text>
                </View>
                <View style={styles.studentStatItem}>
                  <Text style={[styles.studentStatNumber, { color: "#10B981" }]}>
                    {student.presentDays}
                  </Text>
                  <Text style={styles.studentStatLabel}>Present</Text>
                </View>
                <View style={styles.studentStatItem}>
                  <Text style={[styles.studentStatNumber, { color: "#EF4444" }]}>
                    {student.absentDays}
                  </Text>
                  <Text style={styles.studentStatLabel}>Absent</Text>
                </View>
                <View style={styles.studentStatItem}>
                  <Text style={[styles.studentStatNumber, { color: "#F59E0B" }]}>
                    {student.leaveDays}
                  </Text>
                  <Text style={styles.studentStatLabel}>Leave</Text>
                </View>
              </View>

              <View style={styles.progressBarContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { 
                        width: `${student.percentage}%`,
                        backgroundColor: percentageColor,
                      }
                    ]} 
                  />
                </View>
              </View>
            </Card>
          );
        })
      )}
    </View>
  );

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Attendance Management</Text>
          <Text style={styles.headerSubtitle}>{formatDate(new Date().toISOString())}</Text>
        </View>
        <TouchableOpacity 
          style={styles.exportButton}
          onPress={exportAttendanceCSV}
        >
          <MaterialCommunityIcons name="download" size={24} color="#4C6EF5" />
        </TouchableOpacity>
      </View>

      {/* View Toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.viewButton, selectedView === "overview" && styles.viewButtonActive]}
          onPress={() => setSelectedView("overview")}
        >
          <MaterialCommunityIcons 
            name="view-dashboard" 
            size={18} 
            color={selectedView === "overview" ? "#FFFFFF" : "#6B7280"} 
          />
          <Text style={[styles.viewButtonText, selectedView === "overview" && styles.viewButtonTextActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.viewButton, selectedView === "students" && styles.viewButtonActive]}
          onPress={() => setSelectedView("students")}
        >
          <MaterialCommunityIcons 
            name="account-group" 
            size={18} 
            color={selectedView === "students" ? "#FFFFFF" : "#6B7280"} 
          />
          <Text style={[styles.viewButtonText, selectedView === "students" && styles.viewButtonTextActive]}>
            Students
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Class:</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
          >
            {classes.map((cls) => (
              <TouchableOpacity
                key={cls}
                style={[styles.filterChip, selectedClass === cls && styles.filterChipActive]}
                onPress={() => setSelectedClass(cls)}
              >
                <Text style={[styles.filterChipText, selectedClass === cls && styles.filterChipTextActive]}>
                  {cls}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Period:</Text>
          <View style={styles.dateRangeTabs}>
            {dateRanges.map((range) => (
              <TouchableOpacity
                key={range.value}
                style={[
                  styles.dateRangeTab,
                  selectedDateRange === range.value && styles.dateRangeTabActive,
                ]}
                onPress={() => setSelectedDateRange(range.value as any)}
              >
                <Text style={[
                  styles.dateRangeTabText,
                  selectedDateRange === range.value && styles.dateRangeTabTextActive,
                ]}>
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading attendance data...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {selectedView === "overview" ? renderOverview() : renderStudentDetails()}
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
    marginBottom: 20,
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
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  exportButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  viewButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  viewButtonActive: {
    backgroundColor: "#4C6EF5",
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
  },
  viewButtonTextActive: {
    color: "#FFFFFF",
  },
  filtersContainer: {
    gap: 12,
    marginBottom: 20,
  },
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  filterScrollContent: {
    gap: 8,
  },
  filterChip: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  filterChipActive: {
    backgroundColor: "#4C6EF5",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  dateRangeTabs: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
  },
  dateRangeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  dateRangeTabActive: {
    backgroundColor: "#FFFFFF",
  },
  dateRangeTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  dateRangeTabTextActive: {
    color: "#4C6EF5",
  },
  overviewContainer: {
    gap: 16,
  },
  overallCard: {
    marginBottom: 4,
  },
  overallHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  overallTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  overallStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  overallStatItem: {
    alignItems: "center",
    gap: 4,
  },
  overallStatNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  overallStatLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  overallStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
  },
  percentageContainer: {
    marginTop: 8,
  },
  percentageGradient: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  percentageNumber: {
    fontSize: 36,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  percentageLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 12,
  },
  classCard: {
    marginBottom: 0,
  },
  classHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  classInfo: {
    gap: 6,
  },
  classBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  className: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  classStudentCount: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  classPercentageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  classPercentage: {
    fontSize: 16,
    fontWeight: "800",
  },
  classStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
  },
  classStatItem: {
    alignItems: "center",
    gap: 6,
  },
  classStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  classStatNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  classStatLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  viewDetailsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  viewDetailsText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  studentsContainer: {
    gap: 16,
  },
  studentCard: {
    marginBottom: 0,
  },
  studentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  studentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rollBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  rollNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#4C6EF5",
  },
  nameContainer: {
    gap: 2,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  studentClass: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  studentPercentageBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  studentPercentage: {
    fontSize: 15,
    fontWeight: "800",
  },
  studentStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 14,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
  },
  studentStatItem: {
    alignItems: "center",
    gap: 4,
  },
  studentStatNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  studentStatLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  progressBarContainer: {
    gap: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  loadingContainer: {
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
});
