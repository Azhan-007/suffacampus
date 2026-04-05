import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { useModalPortal } from "../../components/ModalPortal";
import { ScheduleForm } from "../../components/ScheduleForm";
import { createSchedule, deleteSchedule, getSchedules, ScheduleClass, updateSchedule } from "../../services/scheduleService";


const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function TeacherSchedule() {
  const { showModal, hideModal } = useModalPortal();
  const [loading, setLoading] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleClass[]>([]);
  const [selectedDay, setSelectedDay] = useState(
    DAYS_OF_WEEK[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1] || "Monday"
  );

  useEffect(() => {
    fetchSchedules();
  }, [selectedDay]);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      const currentTeacherId = await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId") || "unknown";
      const schedulesList = await getSchedules({ teacherId: currentTeacherId, day: selectedDay });

      const currentHour = new Date().getHours();
      const today = DAYS_OF_WEEK[new Date().getDay() === 0 ? 0 : new Date().getDay() - 1];

      const enriched: ScheduleClass[] = schedulesList.map((item) => {
        let status: "upcoming" | "ongoing" | "completed" = "upcoming";
        if (selectedDay === today) {
          const startHour = parseInt(item.startTime?.split(":")[0] || "0");
          const endHour = parseInt(item.endTime?.split(":")[0] || "0");
          if (currentHour >= endHour) status = "completed";
          else if (currentHour >= startHour && currentHour < endHour) status = "ongoing";
        }
        return { ...item, status };
      });

      setSchedules(enriched);
    } catch (error: any) {
      console.warn("Error fetching schedules:", error?.message || error);
      Alert.alert("Error", "Failed to load schedules");
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (schedule?: ScheduleClass) => {
    const initialData = schedule ? {
      subject: schedule.subject,
      class: schedule.class,
      day: schedule.day,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      room: schedule.room,
    } : {
      subject: "",
      class: "",
      day: selectedDay,
      startTime: "08:00",
      endTime: "09:00",
      room: "",
    };

    const modalId = showModal(
      <ScheduleForm
        initialData={initialData}
        isEditing={!!schedule}
        onClose={() => hideModal(modalId)}
        onSave={(data) => {
          handleSave(data, schedule?.id);
          hideModal(modalId);
        }}
      />
    );
  };

  const handleSave = async (data: any, id?: string) => {
    if (!data.subject || !data.class || !data.room) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);
      const currentTeacherId = await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId") || "unknown";
      const currentTeacherName = await AsyncStorage.getItem("userName") || "Teacher";

      if (id) {
        await updateSchedule(id, {
          subject: data.subject,
          class: data.class,
          day: data.day,
          startTime: data.startTime,
          endTime: data.endTime,
          room: data.room,
        });
        Alert.alert("Success", "Schedule updated successfully!");
      } else {
        await createSchedule({
          subject: data.subject,
          class: data.class,
          day: data.day,
          startTime: data.startTime,
          endTime: data.endTime,
          room: data.room,
          teacherId: currentTeacherId,
          teacherName: currentTeacherName,
        });
        Alert.alert("Success", "Schedule added successfully!");
      }

      fetchSchedules();
    } catch (error: any) {
      console.warn("Error saving schedule:", error?.message || error);
      Alert.alert("Error", "Failed to save schedule. " + (error?.message || "Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (schedule: ScheduleClass) => {
    Alert.alert(
      "Delete Schedule",
      `Are you sure you want to delete ${schedule.subject} for ${schedule.class}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSchedule(schedule.id);
              Alert.alert("Success", "Schedule deleted successfully!");
              fetchSchedules();
            } catch (error: any) {
              Alert.alert("Error", "Failed to delete schedule");
            }
          },
        },
      ]
    );
  };

  const getStatusIcon = (status?: string) => {
    if (status === "completed") return { name: "check-circle", color: "#10B981", bgColor: "rgba(16, 185, 129, 0.12)" };
    if (status === "ongoing") return { name: "clock-outline", color: "#4C6EF5", bgColor: "rgba(76, 110, 245, 0.12)" };
    return { name: "clock-alert-outline", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.12)" };
  };

  const getStatusColor = (status?: string) => {
    if (status === "completed") return "#10B981";
    if (status === "ongoing") return "#4C6EF5";
    return "#F59E0B";
  };

  const getStatusLabel = (status?: string) => status ? status.charAt(0).toUpperCase() + status.slice(1) : "Upcoming";

  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>My Schedule</Text>
            <Text style={styles.headerSubtitle}>{selectedDay}</Text>
          </View>
          <TouchableOpacity onPress={() => handleOpenModal()} style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Day Selector */}
        <View style={styles.daySelectorContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daySelector}>
            {DAYS_OF_WEEK.map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.dayChip, selectedDay === day && styles.dayChipActive]}
                onPress={() => setSelectedDay(day)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayChipText, selectedDay === day && styles.dayChipTextActive]}>
                  {day.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Schedule List */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4C6EF5" />
              <Text style={styles.loadingText}>Loading schedule...</Text>
            </View>
          ) : schedules.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="calendar-blank" size={64} color="#CBD5E1" />
              <Text style={styles.emptyText}>No classes scheduled</Text>
              <Text style={styles.emptySubtext}>Tap + to add a new class</Text>
            </View>
          ) : (
            schedules.map((schedule, index) => (
              <Card key={schedule.id} style={styles.scheduleCard}>
                <View style={styles.scheduleHeader}>
                  <View style={[styles.timelineDot, { backgroundColor: getStatusColor(schedule.status) }]} />
                  <View style={styles.scheduleHeaderContent}>
                    <View style={styles.scheduleTimeContainer}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color="#64748B" />
                      <Text style={styles.scheduleTime}>
                        {schedule.startTime} - {schedule.endTime}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(schedule.status) + "15" }]}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(schedule.status) }]} />
                      <Text style={[styles.statusText, { color: getStatusColor(schedule.status) }]}>
                        {getStatusLabel(schedule.status)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.scheduleBody}>
                  <View style={[styles.iconCircle, { backgroundColor: getStatusIcon(schedule.status).bgColor }]}>
                    <MaterialCommunityIcons
                      name={getStatusIcon(schedule.status).name as any}
                      size={28}
                      color={getStatusIcon(schedule.status).color}
                    />
                  </View>
                  <View style={styles.scheduleDetails}>
                    <Text style={styles.subjectText}>{schedule.subject}</Text>
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="account-group" size={16} color="#64748B" />
                      <Text style={styles.detailText}>{schedule.class}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="door" size={16} color="#64748B" />
                      <Text style={styles.detailText}>{schedule.room}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.scheduleActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleOpenModal(schedule)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="pencil" size={18} color="#4C6EF5" />
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDelete(schedule)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="delete" size={18} color="#EF4444" />
                    <Text style={[styles.actionButtonText, { color: "#EF4444" }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>


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
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
  },
  daySelectorContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingVertical: 12,
  },
  daySelector: {
    paddingHorizontal: 20,
    gap: 8,
  },
  dayChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dayChipActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  dayChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  dayChipTextActive: {
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#64748B",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#94A3B8",
    marginTop: 8,
  },
  scheduleCard: {
    marginBottom: 16,
    padding: 0,
    overflow: "hidden",
  },
  scheduleHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  scheduleHeaderContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scheduleTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scheduleTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  scheduleBody: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  scheduleDetails: {
    flex: 1,
    gap: 6,
  },
  subjectText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
  },
  scheduleActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  bottomPadding: {
    height: 40,
  },
  // Modal Styles

});
