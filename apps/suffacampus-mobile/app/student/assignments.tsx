import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    getAssignmentsWithSubmissions,
    submitAssignment,
    type SubmissionPayload,
} from "../../services/assignmentService";

interface Assignment {
  id: string;
  subject: string;
  title: string;
  description: string;
  dueDate: string;
  class: string;
  priority: "High" | "Medium" | "Low";
  totalMarks: number;
  createdBy: string;
  teacher?: string;
  status: "active" | "draft" | "closed";
  // Student-specific fields
  submissionStatus?: "pending" | "submitted" | "graded";
  submittedAt?: string;
  grade?: number;
  feedback?: string;
}

type FilterTab = "all" | "pending" | "submitted" | "graded";

const SUBJECTS_CONFIG: { [key: string]: { icon: string; color: string } } = {
  Mathematics: { icon: "calculator-variant", color: "#4C6EF5" },
  Physics: { icon: "atom", color: "#9C27B0" },
  Chemistry: { icon: "flask", color: "#4CAF50" },
  Biology: { icon: "leaf", color: "#FF5722" },
  English: { icon: "book-open-variant", color: "#FF9800" },
  Hindi: { icon: "translate", color: "#E91E63" },
  History: { icon: "pillar", color: "#795548" },
  Geography: { icon: "earth", color: "#009688" },
  "Computer Science": { icon: "laptop", color: "#3F51B5" },
  "Physical Education": { icon: "run", color: "#FFC107" },
};

const PRIORITIES_CONFIG: { [key: string]: { color: string; bgColor: string } } = {
  High: { color: "#EF4444", bgColor: "#FEE2E2" },
  Medium: { color: "#F59E0B", bgColor: "#FEF3C7" },
  Low: { color: "#10B981", bgColor: "#D1FAE5" },
};

export default function StudentAssignmentsScreen() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [studentClass, setStudentClass] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("Student");

  // Submit modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastAnimation = useState(new Animated.Value(0))[0];

  useEffect(() => {
    loadStudentInfo();
  }, []);

  useEffect(() => {
    if (studentClass) {
      fetchAssignments();
    }
  }, [studentClass]);

  const loadStudentInfo = async () => {
    try {
      const storedClassId = await AsyncStorage.getItem("classId");
      const storedId = await AsyncStorage.getItem("userId");
      const storedName = await AsyncStorage.getItem("userName");
      
      const storedStudentId = await AsyncStorage.getItem("studentId");
      if (storedClassId) setStudentClass(storedClassId);
      if (storedStudentId) setStudentId(storedStudentId);
      else if (storedId) setStudentId(storedId);
      else {
        router.replace("/login");
        return;
      }
      if (storedName) setStudentName(storedName);
    } catch (error) {
      console.warn("Error loading student info:", error);
    }
  };

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      const data = await getAssignmentsWithSubmissions({
        class: studentClass,
        status: "active",
        studentId: studentId,
      });
      setAssignments(data as Assignment[]);
    } catch (error: any) {
      console.warn("Error loading assignments:", error.message);
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

  const openSubmitModal = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setSubmissionText("");
    setShowSubmitModal(true);
  };

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment) return;

    if (!submissionText.trim()) {
      Alert.alert("Required", "Please enter your submission text or notes");
      return;
    }

    setSubmitting(true);

    try {
      const submissionData: SubmissionPayload = {
        assignmentId: selectedAssignment.id,
        studentId: studentId,
        studentName: studentName,
        studentClass: studentClass,
        submissionText: submissionText.trim(),
        submittedAt: new Date().toISOString(),
        status: "submitted",
      };

      await submitAssignment(submissionData);

      showToast("Assignment submitted successfully!");
      setShowSubmitModal(false);
      setSelectedAssignment(null);
      setSubmissionText("");
      fetchAssignments();
    } catch (error: any) {
      console.warn("Submission error:", error);
      Alert.alert("Submission Failed", "Could not submit assignment. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
      setShowSubmitModal(false);
      setSelectedAssignment(null);
      setSubmissionText("");
    }
  };

  const getFilteredAssignments = () => {
    if (filterTab === "all") return assignments;
    return assignments.filter((a) => a.submissionStatus === filterTab);
  };

  const getSubjectIcon = (subjectName: string) => {
    return SUBJECTS_CONFIG[subjectName]?.icon || "book";
  };

  const getSubjectColor = (subjectName: string) => {
    return SUBJECTS_CONFIG[subjectName]?.color || "#4C6EF5";
  };

  const getPriorityStyle = (priority: string) => {
    return PRIORITIES_CONFIG[priority] || { color: "#F59E0B", bgColor: "#FEF3C7" };
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
    pending: assignments.filter((a) => a.submissionStatus === "pending").length,
    submitted: assignments.filter((a) => a.submissionStatus === "submitted").length,
    graded: assignments.filter((a) => a.submissionStatus === "graded").length,
  };

  // Render assignment card
  const renderAssignmentCard = (assignment: Assignment) => {
    const daysUntilDue = getDaysUntilDue(assignment.dueDate);
    const priorityStyle = getPriorityStyle(assignment.priority);
    const subjectColor = getSubjectColor(assignment.subject);
    const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
    const isPending = assignment.submissionStatus === "pending";
    const isSubmitted = assignment.submissionStatus === "submitted";
    const isGraded = assignment.submissionStatus === "graded";

    return (
      <View key={assignment.id} style={styles.assignmentCard}>
        {/* Status indicator bar */}
        <View
          style={[
            styles.statusBar,
            {
              backgroundColor: isGraded
                ? "#10B981"
                : isSubmitted
                ? "#4C6EF5"
                : isOverdue
                ? "#EF4444"
                : "#F59E0B",
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
              <View style={styles.teacherRow}>
                <MaterialCommunityIcons name="account" size={12} color="#6B7280" />
                <Text style={styles.teacherText}>{assignment.teacher || assignment.createdBy}</Text>
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

          {/* Info row */}
          <View style={styles.infoRow}>
            <View style={styles.infoBadge}>
              <MaterialCommunityIcons name="calendar" size={14} color="#6B7280" />
              <Text style={styles.infoText}>Due: {formatDate(assignment.dueDate)}</Text>
            </View>
            <View style={styles.infoBadge}>
              <MaterialCommunityIcons name="star-circle" size={14} color="#4C6EF5" />
              <Text style={styles.infoText}>{assignment.totalMarks} marks</Text>
            </View>
          </View>

          {/* Status and action row */}
          <View style={styles.cardFooter}>
            {/* Status badge */}
            <View style={styles.statusBadgeContainer}>
              {isGraded ? (
                <View style={styles.gradedBadge}>
                  <MaterialCommunityIcons name="check-decagram" size={16} color="#10B981" />
                  <Text style={styles.gradedText}>
                    Graded: {assignment.grade}/{assignment.totalMarks}
                  </Text>
                </View>
              ) : isSubmitted ? (
                <View style={styles.submittedBadge}>
                  <MaterialCommunityIcons name="check-circle" size={16} color="#4C6EF5" />
                  <Text style={styles.submittedText}>Submitted</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.pendingBadge,
                    isOverdue && styles.overdueBadge,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={isOverdue ? "alert-circle" : "clock-outline"}
                    size={16}
                    color={isOverdue ? "#EF4444" : "#F59E0B"}
                  />
                  <Text
                    style={[
                      styles.pendingText,
                      isOverdue && styles.overdueText,
                    ]}
                  >
                    {isOverdue
                      ? `${Math.abs(daysUntilDue!)}d overdue`
                      : daysUntilDue === 0
                      ? "Due today"
                      : `${daysUntilDue}d left`}
                  </Text>
                </View>
              )}
            </View>

            {/* Action button */}
            {isPending && !isOverdue ? (
              <TouchableOpacity
                style={styles.submitButton}
                onPress={() => openSubmitModal(assignment)}
              >
                <LinearGradient
                  colors={["#4C6EF5", "#6B8AFF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitButtonGradient}
                >
                  <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>Submit</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : isGraded && assignment.feedback ? (
              <TouchableOpacity
                style={styles.feedbackButton}
                onPress={() => {
                  Alert.alert(
                    "Teacher's Feedback",
                    assignment.feedback,
                    [{ text: "OK" }]
                  );
                }}
              >
                <MaterialCommunityIcons name="message-text" size={16} color="#4C6EF5" />
                <Text style={styles.feedbackButtonText}>View Feedback</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
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
        <Text style={styles.headerTitle}>My Assignments</Text>
        <View style={styles.headerRight}>
          <View style={styles.classBadgeHeader}>
            <MaterialIcons name="class" size={14} color="#4C6EF5" />
            <Text style={styles.classBadgeText}>{studentClass}</Text>
          </View>
        </View>
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
                <Text style={styles.statNumber}>{statsData.pending}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{statsData.submitted}</Text>
                <Text style={styles.statLabel}>Submitted</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{statsData.graded}</Text>
                <Text style={styles.statLabel}>Graded</Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {(["all", "pending", "submitted", "graded"] as FilterTab[]).map((tab) => (
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
                ? "No assignments assigned to your class yet"
                : `No ${filterTab} assignments`}
            </Text>
          </View>
        ) : (
          filteredAssignments.map((assignment) => renderAssignmentCard(assignment))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit Modal */}
      <Modal visible={showSubmitModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Submit Assignment</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowSubmitModal(false);
                  setSelectedAssignment(null);
                  setSubmissionText("");
                }}
              >
                <MaterialCommunityIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {selectedAssignment && (
                <>
                  {/* Assignment info */}
                  <View style={styles.assignmentInfoBox}>
                    <View style={[styles.modalSubjectIcon, { backgroundColor: `${getSubjectColor(selectedAssignment.subject)}15` }]}>
                      <MaterialCommunityIcons
                        name={getSubjectIcon(selectedAssignment.subject) as any}
                        size={24}
                        color={getSubjectColor(selectedAssignment.subject)}
                      />
                    </View>
                    <View style={styles.assignmentInfoText}>
                      <Text style={styles.modalAssignmentSubject}>{selectedAssignment.subject}</Text>
                      <Text style={styles.modalAssignmentTitle} numberOfLines={2}>
                        {selectedAssignment.title}
                      </Text>
                      <View style={styles.modalAssignmentMeta}>
                        <Text style={styles.modalAssignmentMetaText}>
                          Due: {formatDate(selectedAssignment.dueDate)}
                        </Text>
                        <Text style={styles.modalAssignmentMetaText}>
                          • {selectedAssignment.totalMarks} marks
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Submission input */}
                  <Text style={styles.inputLabel}>Your Submission *</Text>
                  <TextInput
                    style={styles.textAreaInput}
                    placeholder="Enter your answer, notes, or describe your work..."
                    placeholderTextColor="#9CA3AF"
                    value={submissionText}
                    onChangeText={setSubmissionText}
                    multiline
                    numberOfLines={8}
                    textAlignVertical="top"
                  />

                  <View style={styles.submissionNote}>
                    <MaterialCommunityIcons name="information" size={16} color="#6B7280" />
                    <Text style={styles.submissionNoteText}>
                      Once submitted, you cannot modify your submission.
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowSubmitModal(false);
                  setSelectedAssignment(null);
                  setSubmissionText("");
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSubmitAssignment}
                disabled={submitting}
              >
                <LinearGradient
                  colors={submitting ? ["#9CA3AF", "#9CA3AF"] : ["#4C6EF5", "#6B8AFF"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveButtonGradient}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
                      <Text style={styles.saveButtonText}>Submit</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    </SafeAreaView>
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  classBadgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  classBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4C6EF5",
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
  teacherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  teacherText: {
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  infoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadgeContainer: {
    flex: 1,
  },
  gradedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  gradedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#10B981",
  },
  submittedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  submittedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  pendingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F59E0B",
  },
  overdueBadge: {
    backgroundColor: "#FEE2E2",
  },
  overdueText: {
    color: "#EF4444",
  },
  submitButton: {
    borderRadius: 10,
    overflow: "hidden",
  },
  submitButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  feedbackButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  feedbackButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4C6EF5",
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

  // Modal
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
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  assignmentInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F8FAFC",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  modalSubjectIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentInfoText: {
    flex: 1,
    marginLeft: 12,
  },
  modalAssignmentSubject: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  modalAssignmentTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 6,
  },
  modalAssignmentMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  modalAssignmentMetaText: {
    fontSize: 12,
    color: "#6B7280",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textAreaInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1A1A1A",
    height: 150,
    textAlignVertical: "top",
  },
  submissionNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    marginBottom: 20,
  },
  submissionNoteText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
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

