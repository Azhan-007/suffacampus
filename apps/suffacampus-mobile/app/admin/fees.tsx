import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
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
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { createFeeTemplate, deleteFeeTemplate, FeeTemplate, getAdminStudentFees, getFeeTemplates, StudentFeeRecord } from "../../services/adminFeeService";

export default function AdminFeesScreen() {
  const [students, setStudents] = useState<StudentFeeRecord[]>([]);
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentFeeRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"students" | "templates">("students");

  // Template form
  const [templateName, setTemplateName] = useState("");
  const [templateAmount, setTemplateAmount] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateCategory, setTemplateCategory] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [studentList, templateList] = await Promise.all([
        getAdminStudentFees(),
        getFeeTemplates(),
      ]);
      setStudents(studentList);
      setFeeTemplates(templateList);
    } catch (error) {
      console.warn("Error fetching fee data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const handleViewDetails = (student: StudentFeeRecord) => {
    setSelectedStudent(student);
    setModalVisible(true);
  };

  const handleSendReminder = (student: StudentFeeRecord) => {
    Alert.alert(
      "Send Reminder",
      `Send payment reminder to ${student.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            // Send reminder logic here
            Alert.alert("Success", "Payment reminder sent successfully!");
          },
        },
      ]
    );
  };

  const handleAddTemplate = async () => {
    if (!templateName || !templateAmount || !templateCategory) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    try {
      await createFeeTemplate({
        name: templateName,
        amount: parseFloat(templateAmount),
        description: templateDescription,
        category: templateCategory,
      });
      const templates = await getFeeTemplates();
      setFeeTemplates(templates);
      setTemplateModalVisible(false);
      setTemplateName("");
      setTemplateAmount("");
      setTemplateDescription("");
      setTemplateCategory("");
      Alert.alert("Success", "Fee template added successfully!");
    } catch (error) {
      Alert.alert("Error", "Failed to add template");
    }
  };

  const handleDeleteTemplate = (templateId: string) => {
    Alert.alert(
      "Delete Template",
      "Are you sure you want to delete this fee template?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteFeeTemplate(templateId);
              const templates = await getFeeTemplates();
              setFeeTemplates(templates);
              Alert.alert("Success", "Template deleted successfully!");
            } catch (error) {
              Alert.alert("Error", "Failed to delete template");
            }
          },
        },
      ]
    );
  };

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.class.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalCollected = students.reduce((sum, s) => sum + s.paidFees, 0);
  const totalPending = students.reduce((sum, s) => sum + s.pendingFees, 0);
  const totalExpected = students.reduce((sum, s) => sum + s.totalFees, 0);

  const categories = ["Academic", "Facility", "Extracurricular", "Transport", "Other"];

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Fees Management</Text>
          <Text style={styles.headerSubtitle}>Admin Panel</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <Card style={styles.statCard}>
          <MaterialCommunityIcons name="cash-multiple" size={28} color="#10B981" />
          <Text style={styles.statValue}>{formatCurrency(totalCollected)}</Text>
          <Text style={styles.statLabel}>Collected</Text>
        </Card>

        <Card style={styles.statCard}>
          <MaterialCommunityIcons name="clock-alert" size={28} color="#F59E0B" />
          <Text style={styles.statValue}>{formatCurrency(totalPending)}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </Card>

        <Card style={styles.statCard}>
          <MaterialCommunityIcons name="trending-up" size={28} color="#4C6EF5" />
          <Text style={styles.statValue}>{formatCurrency(totalExpected)}</Text>
          <Text style={styles.statLabel}>Expected</Text>
        </Card>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "students" && styles.tabActive]}
          onPress={() => setActiveTab("students")}
        >
          <Text style={[styles.tabText, activeTab === "students" && styles.tabTextActive]}>
            Students
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "templates" && styles.tabActive]}
          onPress={() => setActiveTab("templates")}
        >
          <Text style={[styles.tabText, activeTab === "templates" && styles.tabTextActive]}>
            Fee Templates
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {activeTab === "students" ? (
            <>
              {/* Search */}
              <View style={styles.searchContainer}>
                <MaterialIcons name="search" size={20} color="#9CA3AF" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search students..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Students List */}
              {filteredStudents.map((student) => {
                const statusColor =
                  student.status === "Paid"
                    ? "#10B981"
                    : student.status === "Overdue"
                    ? "#EF4444"
                    : "#F59E0B";

                return (
                  <Card key={student.id} style={styles.studentCard}>
                    <View style={styles.studentHeader}>
                      <View style={styles.studentLeft}>
                        <View
                          style={[
                            styles.studentAvatar,
                            { backgroundColor: statusColor + "15" },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name="account"
                            size={24}
                            color={statusColor}
                          />
                        </View>
                        <View style={styles.studentInfo}>
                          <Text style={styles.studentName}>{student.name}</Text>
                          <Text style={styles.studentDetails}>
                            {student.rollNo} • {student.class}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[styles.statusBadge, { backgroundColor: statusColor + "15" }]}
                      >
                        <Text style={[styles.statusText, { color: statusColor }]}>
                          {student.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.feeDetails}>
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>Total Fees:</Text>
                        <Text style={styles.feeValue}>{formatCurrency(student.totalFees)}</Text>
                      </View>
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>Paid:</Text>
                        <Text style={[styles.feeValue, { color: "#10B981" }]}>
                          {formatCurrency(student.paidFees)}
                        </Text>
                      </View>
                      <View style={styles.feeRow}>
                        <Text style={styles.feeLabel}>Pending:</Text>
                        <Text style={[styles.feeValue, { color: "#EF4444" }]}>
                          {formatCurrency(student.pendingFees)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.progressBarContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${(student.paidFees / student.totalFees) * 100}%`,
                              backgroundColor: statusColor,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {Math.round((student.paidFees / student.totalFees) * 100)}% Paid
                      </Text>
                    </View>

                    <View style={styles.studentActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleViewDetails(student)}
                      >
                        <MaterialIcons name="visibility" size={18} color="#4C6EF5" />
                        <Text style={styles.actionButtonText}>View</Text>
                      </TouchableOpacity>
                      {student.status !== "Paid" && (
                        <TouchableOpacity
                          style={[styles.actionButton, styles.reminderButton]}
                          onPress={() => handleSendReminder(student)}
                        >
                          <MaterialIcons name="notifications" size={18} color="#F59E0B" />
                          <Text style={[styles.actionButtonText, { color: "#F59E0B" }]}>
                            Remind
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </Card>
                );
              })}
            </>
          ) : (
            <>
              {/* Add Template Button */}
              <TouchableOpacity
                style={styles.addTemplateButton}
                onPress={() => setTemplateModalVisible(true)}
              >
                <MaterialIcons name="add" size={24} color="#FFFFFF" />
                <Text style={styles.addTemplateButtonText}>Add Fee Template</Text>
              </TouchableOpacity>

              {/* Templates List */}
              {feeTemplates.map((template) => (
                <Card key={template.id} style={styles.templateCard}>
                  <View style={styles.templateHeader}>
                    <View style={styles.templateLeft}>
                      <View style={styles.templateIcon}>
                        <MaterialCommunityIcons
                          name="currency-inr"
                          size={24}
                          color="#4C6EF5"
                        />
                      </View>
                      <View style={styles.templateInfo}>
                        <Text style={styles.templateName}>{template.name}</Text>
                        <Text style={styles.templateCategory}>{template.category}</Text>
                        {template.description && (
                          <Text style={styles.templateDescription}>
                            {template.description}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={styles.templateRight}>
                      <Text style={styles.templateAmount}>
                        {formatCurrency(template.amount)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteTemplate(template.id)}
                        style={styles.deleteButton}
                      >
                        <MaterialIcons name="delete" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Card>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Student Details Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Fee Details</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            {selectedStudent && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Student Name</Text>
                  <Text style={styles.detailValue}>{selectedStudent.name}</Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Roll Number</Text>
                  <Text style={styles.detailValue}>{selectedStudent.rollNo}</Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Class</Text>
                  <Text style={styles.detailValue}>{selectedStudent.class}</Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Total Fees</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(selectedStudent.totalFees)}
                  </Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Paid Amount</Text>
                  <Text style={[styles.detailValue, { color: "#10B981" }]}>
                    {formatCurrency(selectedStudent.paidFees)}
                  </Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Pending Amount</Text>
                  <Text style={[styles.detailValue, { color: "#EF4444" }]}>
                    {formatCurrency(selectedStudent.pendingFees)}
                  </Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Due Date</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(selectedStudent.dueDate)}
                  </Text>
                </Card>

                <Card style={styles.detailCard}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          selectedStudent.status === "Paid"
                            ? "#10B981"
                            : selectedStudent.status === "Overdue"
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    {selectedStudent.status}
                  </Text>
                </Card>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Template Modal */}
      <Modal
        visible={templateModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTemplateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Fee Template</Text>
              <TouchableOpacity onPress={() => setTemplateModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Template Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Admission Fee"
                value={templateName}
                onChangeText={setTemplateName}
              />

              <Text style={styles.inputLabel}>Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                value={templateAmount}
                onChangeText={setTemplateAmount}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categoryChips}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      templateCategory === cat && styles.categoryChipActive,
                    ]}
                    onPress={() => setTemplateCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        templateCategory === cat && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Optional description"
                value={templateDescription}
                onChangeText={setTemplateDescription}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={styles.submitButton} onPress={handleAddTemplate}>
                <MaterialIcons name="check" size={20} color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Add Template</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
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
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    padding: 16,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  tabsContainer: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#1A1A1A",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  studentCard: {
    marginBottom: 16,
    gap: 12,
  },
  studentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  studentLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  studentInfo: {
    flex: 1,
    gap: 4,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  studentDetails: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  feeDetails: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  feeValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  progressBarContainer: {
    gap: 8,
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
  progressText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "right",
  },
  studentActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EEF2FF",
    paddingVertical: 10,
    borderRadius: 8,
  },
  reminderButton: {
    backgroundColor: "#FEF3C7",
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  addTemplateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4C6EF5",
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  addTemplateButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  templateCard: {
    marginBottom: 12,
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  templateLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  templateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  templateInfo: {
    flex: 1,
    gap: 4,
  },
  templateName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  templateCategory: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  templateDescription: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  templateRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  templateAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  deleteButton: {
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
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
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  detailCard: {
    marginBottom: 12,
    padding: 16,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  categoryChipActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4C6EF5",
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  categoryChipTextActive: {
    color: "#4C6EF5",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4C6EF5",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

