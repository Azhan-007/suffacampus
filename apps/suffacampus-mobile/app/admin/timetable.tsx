import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { createSchedule, deleteSchedule, getAllTimetableEntries, ScheduleClass, updateSchedule } from "../../services/scheduleService";

interface WeeklyStats {
  totalClasses: number;
  classesPerDay: { [key: string]: number };
  totalHours: number;
  hoursPerDay: { [key: string]: number };
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIME_SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

export default function AdminTimetable() {
  const [loading, setLoading] = useState(true);
  const [allEntries, setAllEntries] = useState<ScheduleClass[]>([]);
  const [selectedView, setSelectedView] = useState<"today" | "week" | "month">("today");
  const [selectedDay, setSelectedDay] = useState(DAYS_OF_WEEK[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1] || "Monday");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduleClass | null>(null);
  const [formData, setFormData] = useState({
    subject: "",
    teacher: "",
    class: "",
    day: "Monday",
    startTime: "08:00",
    endTime: "09:00",
    room: "",
    teacherId: "",
  });

  useEffect(() => {
    fetchTimetable();
  }, []);

  const fetchTimetable = async () => {
    try {
      setLoading(true);
      const entries = await getAllTimetableEntries();
      setAllEntries(entries);
    } catch (error) {
      console.warn("Error fetching timetable:", error);
      setAllEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateWeeklyStats = (): WeeklyStats => {
    const stats: WeeklyStats = {
      totalClasses: allEntries.length,
      classesPerDay: {},
      totalHours: 0,
      hoursPerDay: {},
    };

    DAYS_OF_WEEK.forEach((day) => {
      const dayEntries = allEntries.filter((e) => e.day === day);
      stats.classesPerDay[day] = dayEntries.length;
      
      let dayHours = 0;
      dayEntries.forEach((entry) => {
        const startHour = parseInt(entry.startTime.split(":")[0]);
        const endHour = parseInt(entry.endTime.split(":")[0]);
        dayHours += endHour - startHour;
      });
      stats.hoursPerDay[day] = dayHours;
      stats.totalHours += dayHours;
    });

    return stats;
  };

  const getDayEntries = (day: string) => {
    return allEntries.filter((e) => e.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  const handleAddEdit = async () => {
    if (!formData.subject || !formData.teacher || !formData.class || !formData.room) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }

    try {
      if (editingEntry) {
        await updateSchedule(editingEntry.id, {
          subject: formData.subject,
          class: formData.class,
          day: formData.day,
          startTime: formData.startTime,
          endTime: formData.endTime,
          room: formData.room,
          teacherName: formData.teacher,
          teacherId: formData.teacherId,
        });
        Alert.alert("Success", "Timetable entry updated successfully!");
      } else {
        await createSchedule({
          subject: formData.subject,
          class: formData.class,
          day: formData.day,
          startTime: formData.startTime,
          endTime: formData.endTime,
          room: formData.room,
          teacherName: formData.teacher,
          teacherId: formData.teacherId,
        });
        Alert.alert("Success", "Timetable entry added successfully!");
      }
      setModalVisible(false);
      setEditingEntry(null);
      resetForm();
      fetchTimetable();
    } catch (error) {
      Alert.alert("Error", "Failed to save entry. Please try again.");
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this timetable entry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSchedule(id);
              Alert.alert("Success", "Entry deleted successfully!");
              fetchTimetable();
            } catch (error) {
              Alert.alert("Error", "Failed to delete entry.");
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormData({
      subject: "",
      teacher: "",
      class: "",
      day: "Monday",
      startTime: "08:00",
      endTime: "09:00",
      room: "",
      teacherId: "",
    });
  };

  const openEditModal = (entry: ScheduleClass) => {
    setEditingEntry(entry);
    setFormData({
      subject: entry.subject,
      teacher: entry.teacherName,
      class: entry.class,
      day: entry.day,
      startTime: entry.startTime,
      endTime: entry.endTime,
      room: entry.room,
      teacherId: entry.teacherId,
    });
    setModalVisible(true);
  };

  const openAddModal = () => {
    setEditingEntry(null);
    resetForm();
    setModalVisible(true);
  };

  const stats = calculateWeeklyStats();
  const dayEntries = getDayEntries(selectedDay);
  const todayName = DAYS_OF_WEEK[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1] || "Monday";
  const todayEntries = getDayEntries(todayName);

  return (
    <>
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Manage Timetable</Text>
          <Text style={styles.headerSubtitle}>School Schedule Management</Text>
        </View>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading timetable...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* View Tabs */}
          <View style={styles.viewTabs}>
            <TouchableOpacity
              style={[styles.viewTab, selectedView === "today" && styles.viewTabActive]}
              onPress={() => setSelectedView("today")}
            >
              <MaterialCommunityIcons 
                name="calendar-today" 
                size={18} 
                color={selectedView === "today" ? "#FFFFFF" : "#64748B"} 
              />
              <Text style={[styles.viewTabText, selectedView === "today" && styles.viewTabTextActive]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTab, selectedView === "week" && styles.viewTabActive]}
              onPress={() => setSelectedView("week")}
            >
              <MaterialCommunityIcons 
                name="calendar-week" 
                size={18} 
                color={selectedView === "week" ? "#FFFFFF" : "#64748B"} 
              />
              <Text style={[styles.viewTabText, selectedView === "week" && styles.viewTabTextActive]}>Week</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewTab, selectedView === "month" && styles.viewTabActive]}
              onPress={() => setSelectedView("month")}
            >
              <MaterialCommunityIcons 
                name="calendar-month" 
                size={18} 
                color={selectedView === "month" ? "#FFFFFF" : "#64748B"} 
              />
              <Text style={[styles.viewTabText, selectedView === "month" && styles.viewTabTextActive]}>Month</Text>
            </TouchableOpacity>
          </View>

          {/* Stats Overview */}
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>
              {selectedView === "today" ? "Today's Overview" : selectedView === "week" ? "Weekly Overview" : "Monthly Overview"}
            </Text>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: "#EEF2FF" }]}>
                  <MaterialCommunityIcons name="book-open-variant" size={24} color="#4C6EF5" />
                </View>
                <Text style={styles.statValue}>
                  {selectedView === "today" ? todayEntries.length : stats.totalClasses}
                </Text>
                <Text style={styles.statLabel}>Total Classes</Text>
              </Card>

              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: "#FEF3C7" }]}>
                  <MaterialCommunityIcons name="clock-outline" size={24} color="#F59E0B" />
                </View>
                <Text style={styles.statValue}>
                  {selectedView === "today" 
                    ? `${stats.hoursPerDay[todayName] || 0}h` 
                    : selectedView === "week" 
                    ? `${stats.totalHours}h`
                    : `${stats.totalHours * 4}h`}
                </Text>
                <Text style={styles.statLabel}>Total Hours</Text>
              </Card>

              <Card style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: "#DCFCE7" }]}>
                  <MaterialCommunityIcons name="calendar-check" size={24} color="#10B981" />
                </View>
                <Text style={styles.statValue}>
                  {selectedView === "today" ? "1" : selectedView === "week" ? DAYS_OF_WEEK.length : "~20"}
                </Text>
                <Text style={styles.statLabel}>
                  {selectedView === "today" ? "Today" : selectedView === "week" ? "Days" : "Days"}
                </Text>
              </Card>
            </View>
          </View>

          {/* Today View */}
          {selectedView === "today" && (
            <View style={styles.todaySection}>
              <View style={styles.todayHeader}>
                <Text style={styles.sectionTitle}>Today&apos;s Schedule - {todayName}</Text>
                <View style={styles.todayBadge}>
                  <Text style={styles.todayBadgeText}>{todayEntries.length} classes</Text>
                </View>
              </View>
              {todayEntries.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <MaterialCommunityIcons name="calendar-blank" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyText}>No classes scheduled for today</Text>
                </Card>
              ) : (
                <View style={styles.entriesList}>
                  {todayEntries.map((entry) => (
                    <Card key={entry.id} style={styles.entryCard}>
                      <View style={styles.entryHeader}>
                        <View style={styles.entryTime}>
                          <MaterialCommunityIcons name="clock-outline" size={16} color="#4C6EF5" />
                          <Text style={styles.entryTimeText}>{entry.startTime} - {entry.endTime}</Text>
                        </View>
                        <View style={styles.entryActions}>
                          <TouchableOpacity onPress={() => openEditModal(entry)} style={styles.actionBtn}>
                            <MaterialCommunityIcons name="pencil" size={18} color="#4C6EF5" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDelete(entry.id)} style={styles.actionBtn}>
                            <MaterialCommunityIcons name="delete" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.entrySubject}>{entry.subject}</Text>
                      <View style={styles.entryMeta}>
                        <View style={styles.metaItem}>
                          <MaterialCommunityIcons name="account" size={14} color="#64748B" />
                          <Text style={styles.metaText}>{entry.teacherName}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <MaterialCommunityIcons name="google-classroom" size={14} color="#64748B" />
                          <Text style={styles.metaText}>{entry.class}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <MaterialCommunityIcons name="door" size={14} color="#64748B" />
                          <Text style={styles.metaText}>{entry.room}</Text>
                        </View>
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Week View */}
          {selectedView === "week" && (
            <>
              {/* Daily Breakdown */}
              <View style={styles.dailySection}>
                <Text style={styles.sectionTitle}>Daily Breakdown</Text>
                {DAYS_OF_WEEK.map((day) => (
                  <Card key={day} style={styles.dayCard}>
                    <View style={styles.dayCardHeader}>
                      <View style={styles.dayInfo}>
                        <Text style={styles.dayName}>{day}</Text>
                        <Text style={styles.dayMeta}>
                          {stats.classesPerDay[day] || 0} classes • {stats.hoursPerDay[day] || 0} hours
                        </Text>
                      </View>
                      <View style={styles.dayBadge}>
                        <Text style={styles.dayBadgeText}>{stats.classesPerDay[day] || 0}</Text>
                      </View>
                    </View>
                  </Card>
                ))}
              </View>

              {/* Day Selector */}
              <View style={styles.daySelectorSection}>
                <Text style={styles.sectionTitle}>View Schedule By Day</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayScrollContent}
            >
              {DAYS_OF_WEEK.map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[styles.dayButton, selectedDay === day && styles.dayButtonActive]}
                  onPress={() => setSelectedDay(day)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayButtonText, selectedDay === day && styles.dayButtonTextActive]}>
                    {day}
                  </Text>
                  {(stats.classesPerDay[day] || 0) > 0 && (
                    <View style={[styles.classBadge, selectedDay === day && styles.classBadgeActive]}>
                      <Text style={[styles.classBadgeText, selectedDay === day && styles.classBadgeTextActive]}>
                        {stats.classesPerDay[day]}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Day's Schedule */}
          <View style={styles.scheduleSection}>
            <View style={styles.scheduleSectionHeader}>
              <Text style={styles.sectionTitle}>{selectedDay}&apos;s Schedule</Text>
              <Text style={styles.scheduleCount}>
                {dayEntries.length} {dayEntries.length === 1 ? "class" : "classes"}
              </Text>
            </View>

            {dayEntries.length === 0 ? (
              <Card style={styles.emptyCard}>
                <MaterialCommunityIcons name="calendar-blank" size={64} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No Classes Scheduled</Text>
                <Text style={styles.emptyText}>
                  No classes scheduled for {selectedDay}. Tap + to add a class.
                </Text>
              </Card>
            ) : (
              <View style={styles.entriesList}>
                {dayEntries.map((entry) => (
                  <Card key={entry.id} style={styles.entryCard}>
                    <View style={styles.entryContent}>
                      <View style={styles.timeSection}>
                        <View style={styles.timeIndicator}>
                          <MaterialCommunityIcons name="clock-outline" size={20} color="#F59E0B" />
                        </View>
                        <View style={styles.timeTexts}>
                          <Text style={styles.timeText}>{entry.startTime}</Text>
                          <View style={styles.timeDivider} />
                          <Text style={styles.timeText}>{entry.endTime}</Text>
                        </View>
                      </View>

                      <View style={styles.detailsSection}>
                        <Text style={styles.subjectText}>{entry.subject}</Text>
                        <View style={styles.metaRow}>
                          <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="account" size={14} color="#64748B" />
                            <Text style={styles.metaText}>{entry.teacherName}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="google-classroom" size={14} color="#64748B" />
                            <Text style={styles.metaText}>{entry.class}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <MaterialCommunityIcons name="door" size={14} color="#64748B" />
                            <Text style={styles.metaText}>{entry.room}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.actionButtons}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => openEditModal(entry)}
                        >
                          <MaterialCommunityIcons name="pencil" size={18} color="#4C6EF5" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleDelete(entry.id)}
                        >
                          <MaterialCommunityIcons name="delete" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
          </>
          )}

          {/* Month View */}
          {selectedView === "month" && (
            <View style={styles.monthSection}>
              <Text style={styles.sectionTitle}>Monthly Schedule Overview</Text>
              <View style={styles.monthGrid}>
                {DAYS_OF_WEEK.map((day) => {
                  const dayClasses = getDayEntries(day);
                  const hours = stats.hoursPerDay[day] || 0;
                  return (
                    <Card key={day} style={styles.monthDayCard}>
                      <Text style={styles.monthDayName}>{day.substring(0, 3)}</Text>
                      <View style={styles.monthStats}>
                        <View style={styles.monthStatItem}>
                          <MaterialCommunityIcons name="book-open" size={16} color="#4C6EF5" />
                          <Text style={styles.monthStatText}>{dayClasses.length}</Text>
                        </View>
                        <View style={styles.monthStatItem}>
                          <MaterialCommunityIcons name="clock-outline" size={16} color="#F59E0B" />
                          <Text style={styles.monthStatText}>{hours}h</Text>
                        </View>
                      </View>
                      {dayClasses.slice(0, 3).map((entry) => (
                        <View key={entry.id} style={styles.monthClassItem}>
                          <Text style={styles.monthClassTime}>{entry.startTime}</Text>
                          <Text style={styles.monthClassName} numberOfLines={1}>{entry.subject}</Text>
                        </View>
                      ))}
                      {dayClasses.length > 3 && (
                        <Text style={styles.monthMoreText}>+{dayClasses.length - 3} more</Text>
                      )}
                    </Card>
                  );
                })}
              </View>
              <Card style={styles.monthSummary}>
                <Text style={styles.monthSummaryTitle}>Month Summary (4 weeks)</Text>
                <View style={styles.monthSummaryRow}>
                  <View style={styles.monthSummaryItem}>
                    <Text style={styles.monthSummaryValue}>{stats.totalClasses * 4}</Text>
                    <Text style={styles.monthSummaryLabel}>Total Classes</Text>
                  </View>
                  <View style={styles.monthSummaryDivider} />
                  <View style={styles.monthSummaryItem}>
                    <Text style={styles.monthSummaryValue}>{stats.totalHours * 4}h</Text>
                    <Text style={styles.monthSummaryLabel}>Total Hours</Text>
                  </View>
                  <View style={styles.monthSummaryDivider} />
                  <View style={styles.monthSummaryItem}>
                    <Text style={styles.monthSummaryValue}>~20</Text>
                    <Text style={styles.monthSummaryLabel}>Working Days</Text>
                  </View>
                </View>
              </Card>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingEntry ? "Edit Entry" : "Add New Entry"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={styles.label}>Subject *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.subject}
                  onChangeText={(text) => setFormData({ ...formData, subject: text })}
                  placeholder="e.g., Mathematics"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Teacher Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.teacher}
                  onChangeText={(text) => setFormData({ ...formData, teacher: text })}
                  placeholder="e.g., Dr. Sarah Ahmed"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Class *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.class}
                  onChangeText={(text) => setFormData({ ...formData, class: text })}
                  placeholder="e.g., 10A"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Room *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.room}
                  onChangeText={(text) => setFormData({ ...formData, room: text })}
                  placeholder="e.g., R-101"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Day *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipContainer}>
                    {DAYS_OF_WEEK.map((day) => (
                      <TouchableOpacity
                        key={day}
                        style={[styles.chip, formData.day === day && styles.chipActive]}
                        onPress={() => setFormData({ ...formData, day })}
                      >
                        <Text style={[styles.chipText, formData.day === day && styles.chipTextActive]}>
                          {day.substring(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.timeRow}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.label}>Start Time *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipContainer}>
                      {TIME_SLOTS.map((time) => (
                        <TouchableOpacity
                          key={time}
                          style={[styles.timeChip, formData.startTime === time && styles.chipActive]}
                          onPress={() => setFormData({ ...formData, startTime: time })}
                        >
                          <Text style={[styles.chipText, formData.startTime === time && styles.chipTextActive]}>
                            {time}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.label}>End Time *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipContainer}>
                      {TIME_SLOTS.map((time) => (
                        <TouchableOpacity
                          key={time}
                          style={[styles.timeChip, formData.endTime === time && styles.chipActive]}
                          onPress={() => setFormData({ ...formData, endTime: time })}
                        >
                          <Text style={[styles.chipText, formData.endTime === time && styles.chipTextActive]}>
                            {time}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleAddEdit}>
              <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                {editingEntry ? "Update Entry" : "Add Entry"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>

      {/* Modal goes here - already present */}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#F3F6FB",
    paddingTop: 60,
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
  headerTextContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748B",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  statsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 16,
    letterSpacing: -0.3,
    paddingHorizontal: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  statIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  dailySection: {
    marginBottom: 32,
  },
  dayCard: {
    marginBottom: 10,
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  dayCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayInfo: {
    flex: 1,
  },
  dayName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  dayMeta: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    letterSpacing: 0.2,
  },
  dayBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dayBadgeText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#4C6EF5",
  },
  daySelectorSection: {
    marginBottom: 24,
  },
  dayScrollContent: {
    gap: 10,
    paddingHorizontal: 4,
    paddingRight: 20,
  },
  dayButton: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    minWidth: 100,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  dayButtonActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
    shadowColor: "#4C6EF5",
    shadowOpacity: 0.25,
    elevation: 6,
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: -0.2,
  },
  dayButtonTextActive: {
    color: "#FFFFFF",
  },
  classBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  classBadgeActive: {
    backgroundColor: "#FFFFFF33",
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  classBadgeTextActive: {
    color: "#FFFFFF",
  },
  scheduleSection: {
    marginBottom: 16,
  },
  scheduleSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  scheduleCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.2,
  },
  emptyCard: {
    padding: 48,
    alignItems: "center",
    gap: 16,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E293B",
    marginTop: 8,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  entriesList: {
    gap: 12,
  },
  entryCard: {
    padding: 16,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  entryContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  timeSection: {
    alignItems: "center",
    gap: 8,
  },
  timeIndicator: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  timeTexts: {
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: -0.2,
  },
  timeDivider: {
    width: 12,
    height: 1.5,
    backgroundColor: "#CBD5E1",
    borderRadius: 1,
  },
  detailsSection: {
    flex: 1,
    gap: 8,
  },
  subjectText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    letterSpacing: 0.2,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 50,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  modalScroll: {
    maxHeight: "70%",
  },
  formField: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  input: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1E293B",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    fontWeight: "500",
  },
  chipContainer: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  chipActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  timeRow: {
    flexDirection: "row",
    gap: 12,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  saveButton: {
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  // View Tabs
  viewTabs: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  viewTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  viewTabActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  viewTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  viewTabTextActive: {
    color: "#FFFFFF",
  },
  // Today View
  todaySection: {
    marginBottom: 24,
  },
  todayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  todayBadge: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  todayBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  entryMeta: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginTop: 8,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  entryTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  entryTimeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  entryActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  entrySubject: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 10,
  },
  // Month View
  monthSection: {
    marginBottom: 24,
  },
  monthGrid: {
    gap: 12,
  },
  monthDayCard: {
    padding: 16,
    borderRadius: 16,
  },
  monthDayName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 10,
  },
  monthStats: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  monthStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  monthStatText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  monthClassItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  monthClassTime: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    minWidth: 45,
  },
  monthClassName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    flex: 1,
  },
  monthMoreText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4C6EF5",
    marginTop: 8,
  },
  monthSummary: {
    padding: 20,
    borderRadius: 16,
    marginTop: 12,
    backgroundColor: "#EEF2FF",
  },
  monthSummaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 16,
  },
  monthSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  monthSummaryItem: {
    flex: 1,
    alignItems: "center",
  },
  monthSummaryValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#4C6EF5",
  },
  monthSummaryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 4,
  },
  monthSummaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#CBD5E1",
  },
});

