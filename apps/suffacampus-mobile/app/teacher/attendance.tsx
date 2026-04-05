import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    Alert,
    Animated,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useModalPortal } from "../../components/ModalPortal";
import {
    bulkMarkAttendance,
    getAttendanceByClassDate,
    getStudentsByClass,
    upsertAttendance,
} from "../../services/attendanceService";
import { getMyProfile } from "../../services/authService";
import { getClassSectionEntries, type ClassSectionEntry } from "../../services/classService";

interface Student {
  id: string;
  name: string;
  rollNumber: string;
  classId: string;
  sectionId: string;
  status: "Present" | "Absent" | "Leave" | "Not Marked";
}

type FilterType = "all" | "marked" | "unmarked";

export default function AttendanceScreen() {
  const { showModal, hideModal } = useModalPortal();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [classEntries, setClassEntries] = useState<ClassSectionEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ClassSectionEntry | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [showSaveToast, setShowSaveToast] = useState(false);
  const toastAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      try {
        const [allEntries, profile] = await Promise.all([
          getClassSectionEntries(),
          getMyProfile(),
        ]);
        const assigned = profile.assignedClasses ?? [];
        // If teacher has assigned classes, filter; otherwise show all
        const entries = assigned.length > 0
          ? allEntries.filter((e) =>
              assigned.some((a) => a.classId === e.classId && a.sectionId === e.sectionId)
            )
          : allEntries;
        setClassEntries(entries);
        if (entries.length > 0 && !selectedEntry) setSelectedEntry(entries[0]);
      } catch {
        setClassEntries([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedEntry) fetchStudentsAndAttendance();
  }, [selectedEntry, selectedDate]);

  const fetchStudentsAndAttendance = async () => {
    if (!selectedEntry) return;
    setLoading(true);
    try {
      const [studentRecords, attendanceRecords] = await Promise.all([
        getStudentsByClass(selectedEntry.classId, selectedEntry.sectionId),
        getAttendanceByClassDate(selectedEntry.classId, selectedEntry.sectionId, selectedDate),
      ]);

      const attendanceMap: Record<string, "Present" | "Absent"> = {};
      attendanceRecords.forEach((r) => {
        if (r.status === "Present" || r.status === "Absent") {
          attendanceMap[r.studentId] = r.status;
        }
      });

      const studentsList: Student[] = studentRecords.map((s) => ({
        id: s.id,
        name: s.name,
        rollNumber: s.rollNo || "N/A",
        classId: s.classId,
        sectionId: s.sectionId,
        status: (attendanceMap[s.id] ?? "Not Marked") as Student["status"],
      }));

      setStudents(studentsList);
    } catch (err) {
      console.warn("Error fetching attendance data:", err);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const showSuccessToast = () => {
    setShowSaveToast(true);
    Animated.sequence([
      Animated.timing(toastAnimation, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(toastAnimation, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowSaveToast(false));
  };

  const handleMarkAttendance = async (studentId: string, status: "Present" | "Absent" | "Leave") => {
    if (!selectedEntry) return;
    const student = students.find((s) => s.id === studentId);
    if (!student) return;

    setStudents(students.map((s) => (s.id === studentId ? { ...s, status } : s)));

    try {
      const apiStatus = status === "Leave" ? "Absent" : status;
      await upsertAttendance({
        studentId: student.id,
        classId: selectedEntry.classId,
        sectionId: selectedEntry.sectionId,
        date: selectedDate,
        status: apiStatus as "Present" | "Absent",
      });
      showSuccessToast();
    } catch (err) {
      console.warn("Error marking attendance:", err);
      Alert.alert("Error", "Failed to save attendance.");
    }
  };

  const openClassPicker = () => {
    const modalId = showModal(
      <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B", marginBottom: 16 }}>Select Class</Text>
        <ScrollView style={{ maxHeight: 400 }}>
          {classEntries.map((entry) => (
            <TouchableOpacity
              key={`${entry.classId}-${entry.sectionId}`}
              style={{
                flexDirection: "row", alignItems: "center", padding: 14,
                backgroundColor: selectedEntry?.classId === entry.classId && selectedEntry?.sectionId === entry.sectionId ? "#EEF2FF" : "#FFF",
                borderRadius: 10, marginBottom: 6,
              }}
              onPress={() => { setSelectedEntry(entry); hideModal(modalId); }}
            >
              <MaterialCommunityIcons name="google-classroom" size={22} color="#4C6EF5" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "#1E293B", marginLeft: 12 }}>
                Class {entry.label}
              </Text>
              {selectedEntry?.classId === entry.classId && selectedEntry?.sectionId === entry.sectionId && (
                <MaterialCommunityIcons name="check-circle" size={20} color="#4C6EF5" style={{ marginLeft: "auto" }} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={() => hideModal(modalId)} style={{ alignItems: "center", marginTop: 12 }}>
          <Text style={{ fontSize: 15, color: "#64748B" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const handleMarkAll = (status: "Present" | "Absent") => {
    if (!selectedEntry) return;
    Alert.alert(
      `Mark All ${status}`,
      `Mark all ${filteredStudents.length} students as ${status}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            const studentsToMark = filterType === "all" ? students : filteredStudents;
            const updated = students.map((s) => {
              const shouldMark = studentsToMark.some(fs => fs.id === s.id);
              return shouldMark ? { ...s, status: status as Student["status"] } : s;
            });
            setStudents(updated);

            try {
              await bulkMarkAttendance({
                classId: selectedEntry.classId,
                sectionId: selectedEntry.sectionId,
                date: selectedDate,
                entries: studentsToMark.map((s) => ({
                  studentId: s.id,
                  status,
                })),
              });
              showSuccessToast();
            } catch (err) {
              console.warn("Error bulk marking attendance:", err);
              Alert.alert("Error", "Failed to save bulk attendance. Please try again.");
            }
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStudentsAndAttendance();
    setRefreshing(false);
  };

  const getFilteredStudents = () => {
    let filtered = students.filter(
      (s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.rollNumber.includes(searchQuery)
    );
    if (filterType === "marked") filtered = filtered.filter((s) => s.status !== "Not Marked");
    else if (filterType === "unmarked") filtered = filtered.filter((s) => s.status === "Not Marked");
    return filtered.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));
  };

  const filteredStudents = getFilteredStudents();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateString === today.toISOString().split("T")[0]) return "Today";
    if (dateString === yesterday.toISOString().split("T")[0]) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const changeDate = (days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    const today = new Date();
    if (current <= today) setSelectedDate(current.toISOString().split("T")[0]);
  };

  const presentCount = students.filter((s) => s.status === "Present").length;
  const absentCount = students.filter((s) => s.status === "Absent").length;
  const leaveCount = students.filter((s) => s.status === "Leave").length;
  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  const getStatusColor = (status: Student["status"]) => {
    switch (status) {
      case "Present": return "#10B981";
      case "Absent": return "#EF4444";
      case "Leave": return "#F59E0B";
      default: return "#94A3B8";
    }
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Attendance</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Main Content - Single ScrollView */}
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#4C6EF5"]} />}
        >
          {/* Class & Date Selector */}
          <View style={styles.selectorRow}>
            <TouchableOpacity style={styles.classSelector} onPress={openClassPicker}>
              <MaterialCommunityIcons name="google-classroom" size={20} color="#4C6EF5" />
              <Text style={styles.classSelectorText}>Class {selectedEntry?.label || "—"}</Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
            </TouchableOpacity>

            <View style={styles.dateSelector}>
              <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
                <MaterialCommunityIcons name="chevron-left" size={24} color="#4C6EF5" />
              </TouchableOpacity>
              <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
              <TouchableOpacity
                onPress={() => changeDate(1)}
                style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
                disabled={isToday}
              >
                <MaterialCommunityIcons name="chevron-right" size={24} color={isToday ? "#CBD5E1" : "#4C6EF5"} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Simple Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{students.length}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: "#10B981" }]}>{presentCount}</Text>
                <Text style={styles.summaryLabel}>Present</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: "#EF4444" }]}>{absentCount}</Text>
                <Text style={styles.summaryLabel}>Absent</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: "#F59E0B" }]}>{leaveCount}</Text>
                <Text style={styles.summaryLabel}>Leave</Text>
              </View>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search student..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Tabs */}
          <View style={styles.filterTabs}>
            {(["all", "unmarked", "marked"] as FilterType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.filterTab, filterType === type && styles.filterTabActive]}
                onPress={() => setFilterType(type)}
              >
                <Text style={[styles.filterTabText, filterType === type && styles.filterTabTextActive]}>
                  {type === "all" ? `All (${students.length})` :
                    type === "unmarked" ? `Pending (${students.filter(s => s.status === "Not Marked").length})` :
                      `Done (${students.filter(s => s.status !== "Not Marked").length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.quickBtn, styles.quickBtnPresent]} onPress={() => handleMarkAll("Present")}>
              <MaterialCommunityIcons name="check-all" size={18} color="#10B981" />
              <Text style={[styles.quickBtnText, { color: "#10B981" }]}>All Present</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickBtn, styles.quickBtnAbsent]} onPress={() => handleMarkAll("Absent")}>
              <MaterialCommunityIcons name="close-box-multiple" size={18} color="#EF4444" />
              <Text style={[styles.quickBtnText, { color: "#EF4444" }]}>All Absent</Text>
            </TouchableOpacity>
          </View>

          {/* Students List */}
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Loading...</Text>
            </View>
          ) : filteredStudents.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-search" size={48} color="#CBD5E1" />
              <Text style={styles.emptyText}>No students found</Text>
            </View>
          ) : (
            filteredStudents.map((student, index) => (
              <View key={student.id} style={styles.studentCard}>
                <View style={styles.studentLeft}>
                  <View style={[styles.avatar, { backgroundColor: getStatusColor(student.status) + "20" }]}>
                    <Text style={[styles.avatarText, { color: getStatusColor(student.status) }]}>
                      {student.name.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName} numberOfLines={1}>{student.name}</Text>
                    <Text style={styles.studentRoll}>Roll: {student.rollNumber}</Text>
                  </View>
                </View>

                <View style={styles.actionBtns}>
                  <TouchableOpacity
                    style={[styles.actionBtn, student.status === "Present" && styles.actionBtnActive,
                    student.status === "Present" && { backgroundColor: "#10B981" }]}
                    onPress={() => handleMarkAttendance(student.id, "Present")}
                  >
                    <MaterialCommunityIcons name="check" size={18}
                      color={student.status === "Present" ? "#FFF" : "#10B981"} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, student.status === "Absent" && styles.actionBtnActive,
                    student.status === "Absent" && { backgroundColor: "#EF4444" }]}
                    onPress={() => handleMarkAttendance(student.id, "Absent")}
                  >
                    <MaterialCommunityIcons name="close" size={18}
                      color={student.status === "Absent" ? "#FFF" : "#EF4444"} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, student.status === "Leave" && styles.actionBtnActive,
                    student.status === "Leave" && { backgroundColor: "#F59E0B" }]}
                    onPress={() => handleMarkAttendance(student.id, "Leave")}
                  >
                    <MaterialCommunityIcons name="clock-outline" size={18}
                      color={student.status === "Leave" ? "#FFF" : "#F59E0B"} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Toast */}
      {showSaveToast && (
        <Animated.View style={[styles.toast, { opacity: toastAnimation }]}>
          <MaterialCommunityIcons name="check-circle" size={18} color="#FFF" />
          <Text style={styles.toastText}>Saved!</Text>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },

  mainScroll: { flex: 1 },
  scrollContent: { padding: 16 },

  selectorRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  classSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  classSelectorText: { fontSize: 14, fontWeight: "600", color: "#1E293B" },
  dateSelector: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  dateArrow: { padding: 4 },
  dateArrowDisabled: { opacity: 0.4 },
  dateText: { fontSize: 14, fontWeight: "600", color: "#1E293B" },

  summaryCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryDivider: { width: 1, height: 32, backgroundColor: "#E2E8F0" },
  summaryValue: { fontSize: 22, fontWeight: "700", color: "#1E293B" },
  summaryLabel: { fontSize: 12, color: "#64748B", marginTop: 2 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1E293B", padding: 0 },

  filterTabs: { flexDirection: "row", marginBottom: 12, gap: 8 },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  filterTabActive: { backgroundColor: "#4C6EF5", borderColor: "#4C6EF5" },
  filterTabText: { fontSize: 13, fontWeight: "500", color: "#64748B" },
  filterTabTextActive: { color: "#FFF" },

  quickActions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6
  },
  quickBtnPresent: { backgroundColor: "#10B98115" },
  quickBtnAbsent: { backgroundColor: "#EF444415" },
  quickBtnText: { fontSize: 13, fontWeight: "600" },

  emptyState: { paddingVertical: 40, alignItems: "center" },
  emptyText: { fontSize: 14, color: "#94A3B8", marginTop: 8 },

  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  studentLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 10 },
  avatarText: { fontSize: 16, fontWeight: "700" },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: "600", color: "#1E293B", marginBottom: 2 },
  studentRoll: { fontSize: 12, color: "#64748B" },
  actionBtns: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionBtnActive: { borderWidth: 0 },


  toast: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    backgroundColor: "#10B981",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    elevation: 4,
  },
  toastText: { fontSize: 14, fontWeight: "600", color: "#FFF" },
});
