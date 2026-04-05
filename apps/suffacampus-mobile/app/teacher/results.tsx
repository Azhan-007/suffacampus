import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import { useModalPortal } from "../../components/ModalPortal";
import { ResultForm, ResultFormData } from "../../components/ResultForm";
import Screen from "../../components/Screen";
import { bulkPublishResults, createResult, deleteResult, getAllResults, ResultEntry, toggleResultPublish, updateResult } from "../../services/resultService";
import { getClassLabels } from "../../services/classService";

export default function TeacherResultsScreen() {
  const { showModal, hideModal } = useModalPortal();
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>("All");
  const [filterExam, setFilterExam] = useState<string>("All");

  const [classes, setClasses] = useState<string[]>(["All"]);
  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science", "History", "Geography"];
  const examTypes = ["All", "Mid Term", "Final Term", "Unit Test", "Quiz", "Assignment"];

  useEffect(() => {
    fetchResults();
    getClassLabels().then(labels => setClasses(["All", ...labels])).catch(() => {});
  }, []);

  const openForm = (result?: ResultEntry) => {
    const isEditing = !!result;
    const initialData: ResultFormData = result ? {
      studentId: result.studentId ?? "",
      studentName: result.studentName ?? "",
      class: result.class ?? "",
      subject: result.subject,
      marks: result.marks.toString(),
      total: result.total.toString(),
      examType: result.examType ?? "Mid Term",
      examDate: result.examDate ?? "",
      remarks: result.remarks || "",
      published: result.published ?? false,
    } : {
      studentId: "",
      studentName: "",
      class: classes.length > 1 ? classes[1] : "",
      subject: "",
      marks: "",
      total: "100",
      examType: "Mid Term",
      examDate: "",
      remarks: "",
      published: false,
    };

    const modalId = showModal(
      <ResultForm
        initialData={initialData}
        onClose={() => {
          hideModal(modalId);
          resetForm();
        }}
        onSave={(data) => {
          handleSave(data);
          hideModal(modalId);
        }}
        isEditing={isEditing}
        classes={classes.filter(c => c !== "All")}
      />,
      { onClose: () => resetForm() }
    );
  };

  const fetchResults = async () => {
    try {
      setLoading(true);
      const entries = await getAllResults();
      setResults(entries);
    } catch (err: any) {
      console.warn("Error fetching results:", err?.message || err);
      Alert.alert("Error", "Failed to load results");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const calculateGrade = (marks: number, total: number): string => {
    const percentage = (marks / total) * 100;
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C";
    if (percentage >= 40) return "D";
    return "F";
  };

  const handleSave = async (data: ResultFormData) => {
    if (!data.studentId || !data.studentName || !data.subject || !data.marks || !data.examDate) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    const marks = parseInt(data.marks);
    const total = parseInt(data.total);

    if (isNaN(marks) || isNaN(total) || marks < 0 || total <= 0) {
      Alert.alert("Error", "Please enter valid marks");
      return;
    }

    if (marks > total) {
      Alert.alert("Error", "Marks cannot exceed total marks");
      return;
    }

    const grade = calculateGrade(marks, total);
    const percentage = Math.round((marks / total) * 100);
    const currentTeacherId = await AsyncStorage.getItem("userId") ?? "unknown";

    try {
      if (editingId) {
        await updateResult(editingId, {
          studentId: data.studentId,
          studentName: data.studentName,
          class: data.class,
          subject: data.subject,
          marks,
          total,
          grade,
          percentage,
          examType: data.examType,
          examDate: data.examDate,
          remarks: data.remarks,
          published: data.published,
          teacherId: currentTeacherId,
        });
        Alert.alert("Success", "Result updated successfully!" + (data.published ? " Students can now view it." : ""));
      } else {
        await createResult({
          studentId: data.studentId,
          studentName: data.studentName,
          class: data.class,
          subject: data.subject,
          marks,
          total,
          grade,
          percentage,
          examType: data.examType,
          examDate: data.examDate,
          remarks: data.remarks,
          published: data.published,
          teacherId: currentTeacherId,
        });
        Alert.alert("Success", "Result created successfully!" + (data.published ? " Students can now view it." : " Click publish to make it visible to students."));
      }

      resetForm();
      fetchResults();
    } catch (error) {
      console.warn("Error saving result:", error);
      Alert.alert("Error", "Failed to save result");
    }
  };

  const handleEdit = (result: ResultEntry) => {
    setEditingId(result.id);
    setEditingId(result.id);
    openForm(result);
  };

  const handleDelete = (id: string, studentName: string, subject: string) => {
    Alert.alert(
      "Delete Result",
      "Are you sure you want to delete " + subject + " result for " + studentName + "?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteResult(id);
              Alert.alert("Success", "Result deleted successfully!");
              fetchResults();
            } catch (error) {
              console.warn("Error deleting result:", error);
              Alert.alert("Error", "Failed to delete result");
            }
          },
        },
      ]
    );
  };

  const handlePublish = async (id: string, currentStatus: boolean) => {
    const action = currentStatus ? "unpublish" : "publish";
    const message = currentStatus
      ? "This will hide the result from students. Are you sure?"
      : "This will make the result visible to the student. Are you sure?";

    Alert.alert(
      action === "publish" ? "Publish Result" : "Unpublish Result",
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action === "publish" ? "Publish" : "Unpublish",
          onPress: async () => {
            try {
              await toggleResultPublish(id, !currentStatus);
              Alert.alert(
                "Success",
                !currentStatus
                  ? "Result published! Students can now view their marks."
                  : "Result unpublished. Students can no longer view this result."
              );
              fetchResults();
            } catch (error) {
              console.warn("Error publishing result:", error);
              Alert.alert("Error", "Failed to " + action + " result");
            }
          },
        },
      ]
    );
  };

  const handleBulkPublish = async () => {
    const unpublishedResults = results.filter(r => !r.published);

    Alert.alert(
      "Publish All Draft Results",
      `This will publish ${unpublishedResults.length} results and make them visible to students. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish All",
          onPress: async () => {
            try {
              setLoading(true);
              const teacherId = await AsyncStorage.getItem("userId") ?? "unknown";
              await bulkPublishResults(teacherId);
              Alert.alert(
                "Success",
                `Published ${unpublishedResults.length} results! Students can now view them.`
              );
              fetchResults();
            } catch (error) {
              console.warn("Error bulk publishing:", error);
              Alert.alert("Error", "Failed to publish some results");
              fetchResults();
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setEditingId(null);
  };

  const getSubjectColor = (subject: string) => {
    const colors: { [key: string]: string } = {
      "Mathematics": "#4C6EF5",
      "Physics": "#10B981",
      "Chemistry": "#EC4899",
      "Biology": "#14B8A6",
      "English": "#F59E0B",
      "Computer Science": "#8B5CF6",
      "History": "#78716C",
      "Geography": "#0EA5E9",
    };
    return colors[subject] || "#6B7280";
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "#10B981";
    if (grade.startsWith("B")) return "#3B82F6";
    if (grade.startsWith("C")) return "#F59E0B";
    if (grade.startsWith("D")) return "#EF4444";
    return "#6B7280";
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

  const filteredResults = results.filter((r) => {
    const classMatch = filterClass === "All" || r.class === filterClass;
    const examMatch = filterExam === "All" || r.examType === filterExam;
    return classMatch && examMatch;
  });

  const publishedCount = results.filter((r) => r.published).length;
  const unpublishedCount = results.length - publishedCount;

  const renderResultCard = (result: ResultEntry) => {
    const subjectColor = getSubjectColor(result.subject);
    const gradeColor = getGradeColor(result.grade);
    const percentage = Math.round((result.marks / result.total) * 100);

    return (
      <Card key={result.id} style={styles.resultCard}>
        <View style={[styles.accentBar, { backgroundColor: subjectColor }]} />

        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.leftHeader}>
              <Text style={styles.studentName}>{result.studentName}</Text>
              <View style={styles.metaRow}>
                <View style={styles.classBadge}>
                  <MaterialCommunityIcons name="google-classroom" size={12} color="#4C6EF5" />
                  <Text style={styles.classText}>{result.class}</Text>
                </View>
                <View style={styles.examBadge}>
                  <MaterialCommunityIcons name="clipboard-text" size={12} color="#6B7280" />
                  <Text style={styles.examText}>{result.examType}</Text>
                </View>
              </View>
            </View>

            {result.published ? (
              <View style={styles.publishedBadge}>
                <MaterialCommunityIcons name="check-circle" size={14} color="#10B981" />
                <Text style={styles.publishedText}>Published</Text>
              </View>
            ) : (
              <View style={styles.draftBadge}>
                <MaterialCommunityIcons name="clock-outline" size={14} color="#F59E0B" />
                <Text style={styles.draftText}>Draft</Text>
              </View>
            )}
          </View>

          {/* Subject & Score */}
          <View style={styles.scoreRow}>
            <View style={[styles.subjectBadge, { backgroundColor: subjectColor + '15' }]}>
              <Text style={[styles.subjectText, { color: subjectColor }]}>
                {result.subject}
              </Text>
            </View>

            <View style={styles.scoreDisplay}>
              <Text style={styles.marksText}>
                {result.marks}/{result.total}
              </Text>
              <Text style={styles.percentageText}>({percentage}%)</Text>
              <View style={[styles.gradeBadge, { backgroundColor: gradeColor }]}>
                <Text style={styles.gradeText}>{result.grade}</Text>
              </View>
            </View>
          </View>

          {/* Remarks */}
          {result.remarks && (
            <View style={styles.remarksContainer}>
              <MaterialCommunityIcons name="message-text" size={14} color="#6B7280" />
              <Text style={styles.remarksText} numberOfLines={1}>
                {result.remarks}
              </Text>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footerRow}>
            <View style={styles.dateContainer}>
              <MaterialCommunityIcons name="calendar" size={14} color="#6B7280" />
              <Text style={styles.dateText}>{formatDate(result.examDate ?? "")}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[
                styles.publishButton,
                result.published ? styles.unpublishButton : null,
              ]}
              onPress={() => handlePublish(result.id, result.published ?? false)}
            >
              <MaterialCommunityIcons
                name={result.published ? "eye-off" : "publish"}
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.publishButtonText}>
                {result.published ? "Unpublish" : "Publish"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => handleEdit(result)}
            >
              <MaterialCommunityIcons name="pencil" size={16} color="#4C6EF5" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(result.id, result.studentName ?? "", result.subject)}
            >
              <MaterialCommunityIcons name="delete" size={16} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <>
      <Screen>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Manage Results</Text>
            <Text style={styles.headerSubtitle}>{results.length} total results</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              resetForm();
              openForm();
            }}
          >
            <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="file-document-multiple" size={28} color="#4C6EF5" />
            <Text style={styles.statValue}>{results.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="check-circle" size={28} color="#10B981" />
            <Text style={styles.statValue}>{publishedCount}</Text>
            <Text style={styles.statLabel}>Published</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="clock-outline" size={28} color="#F59E0B" />
            <Text style={styles.statValue}>{unpublishedCount}</Text>
            <Text style={styles.statLabel}>Draft</Text>
          </View>
        </View>

        {/* Bulk Publish */}
        {unpublishedCount > 0 && (
          <View style={styles.bulkActionContainer}>
            <TouchableOpacity
              style={styles.bulkPublishButton}
              onPress={() => handleBulkPublish()}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="publish" size={20} color="#FFFFFF" />
              <Text style={styles.bulkPublishText}>
                Publish All {unpublishedCount} Draft Results
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filtersRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <Text style={styles.filterLabel}>Class:</Text>
            {classes.map((cls) => (
              <TouchableOpacity
                key={cls}
                style={[styles.filterTab, filterClass === cls && styles.filterTabActive]}
                onPress={() => setFilterClass(cls)}
              >
                <Text style={[styles.filterTabText, filterClass === cls && styles.filterTabTextActive]}>
                  {cls}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.filtersRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterContainer}
            contentContainerStyle={styles.filterContent}
          >
            <Text style={styles.filterLabel}>Exam:</Text>
            {examTypes.map((exam) => (
              <TouchableOpacity
                key={exam}
                style={[styles.filterTab, filterExam === exam && styles.filterTabActive]}
                onPress={() => setFilterExam(exam)}
              >
                <Text style={[styles.filterTabText, filterExam === exam && styles.filterTabTextActive]}>
                  {exam}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#4C6EF5" />
            <Text style={styles.loadingText}>Loading results...</Text>
          </View>
        ) : filteredResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <View style={styles.emptyIconContainer}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#D1D5DB" />
            </View>
            <Text style={styles.emptyTitle}>No results yet</Text>
            <Text style={styles.emptyText}>
              Tap the + button to add student results
            </Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredResults.map(renderResultCard)}
          </View>
        )}
      </Screen>


    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 4,
  },
  bulkActionContainer: {
    marginBottom: 20,
  },
  bulkPublishButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  bulkPublishText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  filtersRow: {
    marginBottom: 12,
  },
  filterContainer: {
    maxHeight: 50,
  },
  filterContent: {
    gap: 10,
    alignItems: "center",
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginRight: 4,
  },
  filterTab: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: "#4C6EF5",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },
  listContainer: {
    gap: 16,
  },
  resultCard: {
    marginBottom: 0,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardContent: {
    gap: 12,
    paddingLeft: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  leftHeader: {
    flex: 1,
    gap: 6,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  metaRow: {
    flexDirection: "row",
    gap: 8,
  },
  classBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  classText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  examBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  examText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  publishedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  publishedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10B981",
  },
  draftBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  draftText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F59E0B",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subjectBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  subjectText: {
    fontSize: 13,
    fontWeight: "700",
  },
  scoreDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  marksText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  percentageText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  gradeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 48,
    alignItems: "center",
  },
  gradeText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  remarksContainer: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  remarksText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    fontStyle: "italic",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  publishButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10B981",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  unpublishButton: {
    backgroundColor: "#6B7280",
  },
  publishButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#4C6EF5",
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },

});
