import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AssignmentFormData, CreateAssignmentForm } from "../../components/CreateAssignmentForm";
import { useModalPortal } from "../../components/ModalPortal";
import {
    Assignment,
    createAssignment,
    deleteAssignment,
    getTeacherAssignments,
    toggleAssignmentStatus,
    updateAssignment,
} from "../../services/assignmentService";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FilterTab = "all" | "active" | "draft" | "closed";

const SUBJECTS = [
  { name: "Mathematics", icon: "calculator-variant", color: "#4C6EF5" },
  { name: "Physics", icon: "atom", color: "#9C27B0" },
  { name: "Chemistry", icon: "flask", color: "#4CAF50" },
  { name: "Biology", icon: "leaf", color: "#FF5722" },
  { name: "English", icon: "book-open-variant", color: "#FF9800" },
  { name: "Hindi", icon: "translate", color: "#E91E63" },
  { name: "History", icon: "pillar", color: "#795548" },
  { name: "Geography", icon: "earth", color: "#009688" },
  { name: "Computer Science", icon: "laptop", color: "#3F51B5" },
  { name: "Physical Education", icon: "run", color: "#FFC107" },
];

const PRIORITIES = [
  { label: "High", value: "High", color: "#EF4444", bgColor: "#FEE2E2" },
  { label: "Medium", value: "Medium", color: "#F59E0B", bgColor: "#FEF3C7" },
  { label: "Low", value: "Low", color: "#10B981", bgColor: "#D1FAE5" },
];

export default function TeacherAssignmentsScreen() {
  const { showModal, hideModal, hideAllModals } = useModalPortal();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [teacherName, setTeacherName] = useState("Teacher");
  const [teacherEmail, setTeacherEmail] = useState("");

  // Modal IDs for managing portal modals
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastAnimation = useState(new Animated.Value(0))[0];

  useEffect(() => {
    loadTeacherInfo();
    fetchAssignments();
  }, []);

  const loadTeacherInfo = async () => {
    try {
      const name = await AsyncStorage.getItem("userName");
      const email = await AsyncStorage.getItem("userEmail");
      if (name) setTeacherName(name);
      if (email) setTeacherEmail(email);
    } catch (error) {
      console.warn("Error loading teacher info:", error);
    }
  };

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const data = await getTeacherAssignments();
      setAssignments(data);
    } catch (err) {
      console.warn("Error fetching assignments:", err);
      setAssignments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchAssignments();
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastAnimation, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastAnimation, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };



  const openCreateModal = () => {
    const initialData = {
      subject: "",
      title: "",
      description: "",
      dueDate: "",
      class: "",
      priority: "Medium" as "High" | "Medium" | "Low",
      totalMarks: "100",
      status: "active" as "active" | "draft" | "closed",
    };

    const modalId = showModal(
      <CreateAssignmentForm
        initialData={initialData}
        onClose={() => {
          hideModal(modalId);
        }}
        onSave={(data) => {
          handleSaveAssignment(data);
          hideModal(modalId);
        }}
        isEditing={false}
      />
    );
  };

  const openEditModal = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    const initialData = {
      subject: assignment.subject,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      class: assignment.class,
      priority: assignment.priority,
      totalMarks: assignment.totalMarks.toString(),
      status: assignment.status,
    };

    const modalId = showModal(
      <CreateAssignmentForm
        initialData={initialData}
        onClose={() => {
          hideModal(modalId);
          setEditingAssignment(null);
        }}
        onSave={(data) => {
          handleSaveAssignment(data);
          hideModal(modalId);
        }}
        isEditing={true}
      />
    );
  };

  const handleSaveAssignment = async (data: AssignmentFormData) => {
    try {
      const assignmentData = {
        subject: data.subject,
        title: data.title.trim(),
        description: data.description.trim(),
        dueDate: data.dueDate,
        class: data.class,
        priority: data.priority,
        totalMarks: parseInt(data.totalMarks) || 100,
        status: data.status,
        createdBy: teacherName,
        teacher: teacherName,
        teacherEmail: teacherEmail,
        visibleToStudents: data.status === "active",
        updatedAt: new Date().toISOString(),
      };

      if (editingAssignment) {
        await updateAssignment(editingAssignment.id, assignmentData);
        showToast("Assignment updated successfully!");
      } else {
        await createAssignment(assignmentData);
        showToast("Assignment created successfully!");
      }

      setEditingAssignment(null);
      fetchAssignments();
    } catch (err) {
      console.warn("Error saving assignment:", err);
      Alert.alert("Error", "Failed to save assignment");
      setEditingAssignment(null);
    }
  };

  const handleDeleteAssignment = (assignment: Assignment) => {
    Alert.alert(
      "Delete Assignment",
      `Are you sure you want to delete "${assignment.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAssignment(assignment.id);
              showToast("Assignment deleted");
              fetchAssignments();
            } catch (err) {
              console.warn("Error deleting assignment:", err);
              Alert.alert("Error", "Failed to delete assignment");
            }
          },
        },
      ]
    );
  };

  const handleToggleStatus = async (assignment: Assignment) => {
    const newStatus = assignment.status === "active" ? "closed" : "active";
    try {
      await toggleAssignmentStatus(assignment.id, newStatus);
      showToast(`Assignment ${newStatus === "active" ? "activated" : "closed"}`);
      fetchAssignments();
    } catch (err) {
      console.warn("Error toggling status:", err);
      Alert.alert("Error", "Failed to update assignment status");
    }
  };

  const getFilteredAssignments = () => {
    if (filterTab === "all") return assignments;
    return assignments.filter((a) => a.status === filterTab);
  };

  const getSubjectIcon = (subjectName: string) => {
    const subject = SUBJECTS.find((s) => s.name === subjectName);
    return subject?.icon || "book";
  };

  const getSubjectColor = (subjectName: string) => {
    const subject = SUBJECTS.find((s) => s.name === subjectName);
    return subject?.color || "#4C6EF5";
  };

  const getPriorityStyle = (priority: string) => {
    const p = PRIORITIES.find((pr) => pr.value === priority);
    return { color: p?.color || "#F59E0B", bgColor: p?.bgColor || "#FEF3C7" };
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getDaysUntilDue = (dateString: string) => {
    try {
      const dueDate = new Date(dateString);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };



  const filteredAssignments = getFilteredAssignments();
  const statsData = {
    total: assignments.length,
    active: assignments.filter((a) => a.status === "active").length,
    draft: assignments.filter((a) => a.status === "draft").length,
    closed: assignments.filter((a) => a.status === "closed").length,
  };

  // Render assignment card
  const renderAssignmentCard = (assignment: Assignment) => {
    const daysUntilDue = getDaysUntilDue(assignment.dueDate);
    const priorityStyle = getPriorityStyle(assignment.priority);
    const subjectColor = getSubjectColor(assignment.subject);
    const isOverdue = daysUntilDue !== null && daysUntilDue < 0;

    return (
      <TouchableOpacity
        key={assignment.id}
        style={styles.assignmentCard}
        onPress={() => openEditModal(assignment)}
        activeOpacity={0.7}
      >
        {/* Status indicator bar */}
        <View
          style={[
            styles.statusBar,
            {
              backgroundColor:
                assignment.status === "active"
                  ? "#10B981"
                  : assignment.status === "draft"
                    ? "#F59E0B"
                    : "#94A3B8",
            },
          ]}
        />

        <View style={styles.cardContent}>
          {/* Header row */}
          <View style={styles.cardHeader}>
            <View style={[styles.subjectIconCircle, { backgroundColor: `${subjectColor}15` }]}>
              <MaterialCommunityIcons
                name={getSubjectIcon(assignment.subject) as any}
                size={22}
                color={subjectColor}
              />
            </View>
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.subjectText}>{assignment.subject}</Text>
              <View style={styles.classDateRow}>
                <View style={styles.classBadge}>
                  <MaterialIcons name="class" size={12} color="#6B7280" />
                  <Text style={styles.classText}>{assignment.class}</Text>
                </View>
                <View style={styles.dateBadge}>
                  <MaterialCommunityIcons name="calendar" size={12} color="#6B7280" />
                  <Text style={styles.dateText}>{formatDate(assignment.dueDate)}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.priorityBadge, { backgroundColor: priorityStyle.bgColor }]}>
              <Text style={[styles.priorityText, { color: priorityStyle.color }]}>
                {assignment.priority}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.titleText} numberOfLines={2}>
            {assignment.title}
          </Text>

          {/* Description */}
          <Text style={styles.descriptionText} numberOfLines={2}>
            {assignment.description}
          </Text>

          {/* Footer row */}
          <View style={styles.cardFooter}>
            <View style={styles.footerLeft}>
              {/* Marks */}
              <View style={styles.marksBadge}>
                <MaterialCommunityIcons name="star-circle" size={14} color="#4C6EF5" />
                <Text style={styles.marksText}>{assignment.totalMarks} marks</Text>
              </View>

              {/* Due status */}
              {daysUntilDue !== null && (
                <View
                  style={[
                    styles.dueBadge,
                    {
                      backgroundColor: isOverdue
                        ? "#FEE2E2"
                        : daysUntilDue <= 2
                          ? "#FEF3C7"
                          : "#D1FAE5",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dueText,
                      {
                        color: isOverdue
                          ? "#EF4444"
                          : daysUntilDue <= 2
                            ? "#F59E0B"
                            : "#10B981",
                      },
                    ]}
                  >
                    {isOverdue
                      ? `${Math.abs(daysUntilDue)}d overdue`
                      : daysUntilDue === 0
                        ? "Due today"
                        : `${daysUntilDue}d left`}
                  </Text>
                </View>
              )}

              {/* Submissions count */}
              {(assignment.submissionCount ?? 0) > 0 && (
                <View style={styles.submissionBadge}>
                  <MaterialCommunityIcons name="account-check" size={14} color="#10B981" />
                  <Text style={styles.submissionText}>
                    {assignment.submissionCount} submitted
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleToggleStatus(assignment)}
              >
                <MaterialCommunityIcons
                  name={assignment.status === "active" ? "eye-off" : "eye"}
                  size={18}
                  color="#6B7280"
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleDeleteAssignment(assignment)}
              >
                <MaterialCommunityIcons name="delete-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Assignments</Text>
          <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
            <LinearGradient
              colors={["#4C6EF5", "#6B8AFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addButtonGradient}
            >
              <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <LinearGradient
              colors={["#4C6EF5", "#6B8AFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statsGradient}
            >
              <View style={styles.statsContent}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statsData.total}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statsData.active}</Text>
                  <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statsData.draft}</Text>
                  <Text style={styles.statLabel}>Drafts</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{statsData.closed}</Text>
                  <Text style={styles.statLabel}>Closed</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(["all", "active", "draft", "closed"] as FilterTab[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.filterTab, filterTab === tab && styles.filterTabActive]}
                onPress={() => setFilterTab(tab)}
              >
                <Text style={[styles.filterTabText, filterTab === tab && styles.filterTabTextActive]}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Assignments List */}
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#4C6EF5"]} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4C6EF5" />
              <Text style={styles.loadingText}>Loading assignments...</Text>
            </View>
          ) : filteredAssignments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No Assignments Found</Text>
              <Text style={styles.emptySubtitle}>
                {filterTab === "all"
                  ? "Create your first assignment to get started"
                  : `No ${filterTab} assignments`}
              </Text>
              {filterTab === "all" && (
                <TouchableOpacity style={styles.emptyButton} onPress={openCreateModal}>
                  <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                  <Text style={styles.emptyButtonText}>Create Assignment</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredAssignments.map((assignment) => renderAssignmentCard(assignment))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Toast */}
      {toastVisible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastAnimation,
              transform: [
                {
                  translateY: toastAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.toastContent}>
            <MaterialCommunityIcons name="check-circle" size={20} color="#10B981" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  addButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  addButtonGradient: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  // Stats
  statsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  statsCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
  statsGradient: {
    padding: 20,
  },
  statsContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },

  // Filters
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterScroll: {
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterTabActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },

  // List
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },

  // Assignment Card
  assignmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 12,
    flexDirection: "row",
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  statusBar: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  subjectIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  subjectText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  classDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  classText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  dateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 6,
    lineHeight: 22,
  },
  descriptionText: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  marksBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  marksText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4C6EF5",
  },
  dueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dueText: {
    fontSize: 11,
    fontWeight: "600",
  },
  submissionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  submissionText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#10B981",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },

  // Loading & Empty
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
    textAlign: "center",
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#4C6EF5",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Modal
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 50,
  },
  safeArea: {
    width: "100%",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    maxHeight: 400,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  saveButton: {
    flex: 2,
    borderRadius: 12,
    overflow: "hidden",
  },
  saveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // Input styles
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1A1A1A",
  },
  textAreaInput: {
    height: 100,
    paddingTop: 14,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pickerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: "#9CA3AF",
  },

  // Priority selector
  prioritySelector: {
    flexDirection: "row",
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },

  // Status selector
  statusSelector: {
    gap: 8,
  },
  statusOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOptionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },

  // Picker Modals
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  pickerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  pickerModalContent: {
    flex: 1,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  pickerItemSelected: {
    backgroundColor: "#EEF2FF",
    marginHorizontal: -20,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderBottomWidth: 0,
  },
  pickerItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pickerItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },

  // Class grid
  classGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 20,
  },
  classGridItem: {
    width: (SCREEN_WIDTH - 80) / 4,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  classGridItemSelected: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  classGridItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  classGridItemTextSelected: {
    color: "#FFFFFF",
  },

  // Date picker
  dateItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dateItemSelected: {
    backgroundColor: "#EEF2FF",
    marginHorizontal: -20,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderBottomWidth: 0,
  },
  dateItemContent: {
    flex: 1,
  },
  dateItemDay: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  dateItemDaySelected: {
    color: "#4C6EF5",
  },
  dateItemDate: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  dateItemDateSelected: {
    color: "#4C6EF5",
  },

  // Toast
  toastContainer: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
  },
  toastContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  toastText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1A1A1A",
  },
});



