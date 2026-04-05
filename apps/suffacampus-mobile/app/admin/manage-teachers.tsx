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
import { createTeacher, deleteTeacher, getTeachers, TeacherListItem, TeacherProfile, updateTeacher } from "../../services/teacherService";

export default function ManageTeachers() {
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<TeacherProfile | null>(null);
  const [formData, setFormData] = useState<Partial<TeacherProfile>>({
    name: "",
    employeeId: "",
    designation: "",
    department: "",
    email: "",
    phone: "",
    qualification: "",
    specialization: "",
    experience: "",
    joiningDate: "",
    subjects: [],
    classesAssigned: [],
    totalStudents: 0,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const list = await getTeachers();
        setTeachers(list);
      } catch (error) {
        console.warn("Error fetching teachers:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleAddEdit = async () => {
    if (!formData.name || !formData.employeeId || !formData.email) {
      Alert.alert("Error", "Please fill in required fields (Name, Employee ID, Email)");
      return;
    }

    try {
      if (editingTeacher) {
        await updateTeacher(editingTeacher.id, formData);
        Alert.alert("Success", "Teacher updated successfully!");
      } else {
        await createTeacher(formData as Omit<TeacherListItem, "id">);
        Alert.alert("Success", "Teacher added successfully!");
      }
      setModalVisible(false);
      resetForm();
      const list = await getTeachers();
      setTeachers(list);
    } catch (error) {
      Alert.alert("Error", "Failed to save teacher. Please try again.");
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Teacher",
      `Are you sure you want to delete ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTeacher(id);
              const list = await getTeachers();
              setTeachers(list);
              Alert.alert("Success", "Teacher deleted successfully!");
            } catch (error) {
              Alert.alert("Error", "Failed to delete teacher.");
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setFormData({
      name: "",
      employeeId: "",
      designation: "",
      department: "",
      email: "",
      phone: "",
      qualification: "",
      specialization: "",
      experience: "",
      joiningDate: "",
      subjects: [],
      classesAssigned: [],
      totalStudents: 0,
    });
    setEditingTeacher(null);
  };

  const openEditModal = (teacher: TeacherProfile) => {
    setEditingTeacher(teacher);
    setFormData(teacher);
    setModalVisible(true);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  return (
    <>
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Manage Teachers</Text>
          <Text style={styles.headerSubtitle}>{teachers.length} teachers</Text>
        </View>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading teachers...</Text>
        </View>
      ) : teachers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="account-group-outline" size={64} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No Teachers</Text>
          <Text style={styles.emptyText}>Add your first teacher to get started</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={openAddModal}>
            <Text style={styles.emptyButtonText}>Add Teacher</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.list}>
            {teachers.map((teacher) => (
              <Card key={teacher.id} style={styles.teacherCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatarCircle}>
                    <MaterialCommunityIcons name="account" size={32} color="#4C6EF5" />
                  </View>
                  <View style={styles.teacherInfo}>
                    <Text style={styles.teacherName}>{teacher.name}</Text>
                    <Text style={styles.teacherId}>{teacher.employeeId}</Text>
                    <View style={styles.badge}>
                      <MaterialCommunityIcons name="briefcase" size={12} color="#4C6EF5" />
                      <Text style={styles.badgeText}>
                        {teacher.designation} • {teacher.department}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="email" size={16} color="#64748B" />
                    <Text style={styles.infoText}>{teacher.email}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="phone" size={16} color="#64748B" />
                    <Text style={styles.infoText}>{teacher.phone}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <MaterialCommunityIcons name="book-open-variant" size={16} color="#64748B" />
                    <Text style={styles.infoText}>
                      {teacher.subjects?.join(", ") || "No subjects"}
                    </Text>
                  </View>
                  <View style={styles.statsRow}>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>{teacher.classesAssigned?.length || 0}</Text>
                      <Text style={styles.statLabel}>Classes</Text>
                    </View>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>{teacher.totalStudents || 0}</Text>
                      <Text style={styles.statLabel}>Students</Text>
                    </View>
                    <View style={styles.statChip}>
                      <Text style={styles.statValue}>{teacher.experience || "0"}</Text>
                      <Text style={styles.statLabel}>Experience</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(teacher)}
                  >
                    <MaterialCommunityIcons name="pencil" size={18} color="#4C6EF5" />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(teacher.id, teacher.name)}
                  >
                    <MaterialCommunityIcons name="delete" size={18} color="#EF4444" />
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTeacher ? "Edit Teacher" : "Add Teacher"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="e.g., Dr. Sarah Ahmed"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Employee ID *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.employeeId}
                  onChangeText={(text) => setFormData({ ...formData, employeeId: text })}
                  placeholder="e.g., EMP-2024001"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(text) => setFormData({ ...formData, email: text })}
                  placeholder="e.g., teacher@school.edu"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Phone</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text })}
                  placeholder="e.g., +60 12-345 6789"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Designation</Text>
                <TextInput
                  style={styles.input}
                  value={formData.designation}
                  onChangeText={(text) => setFormData({ ...formData, designation: text })}
                  placeholder="e.g., Senior Teacher"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Department</Text>
                <TextInput
                  style={styles.input}
                  value={formData.department}
                  onChangeText={(text) => setFormData({ ...formData, department: text })}
                  placeholder="e.g., Mathematics"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Qualification</Text>
                <TextInput
                  style={styles.input}
                  value={formData.qualification}
                  onChangeText={(text) => setFormData({ ...formData, qualification: text })}
                  placeholder="e.g., Ph.D. in Mathematics"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Specialization</Text>
                <TextInput
                  style={styles.input}
                  value={formData.specialization}
                  onChangeText={(text) => setFormData({ ...formData, specialization: text })}
                  placeholder="e.g., Algebra & Calculus"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Experience</Text>
                <TextInput
                  style={styles.input}
                  value={formData.experience}
                  onChangeText={(text) => setFormData({ ...formData, experience: text })}
                  placeholder="e.g., 15 years"
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Joining Date</Text>
                <TextInput
                  style={styles.input}
                  value={formData.joiningDate}
                  onChangeText={(text) => setFormData({ ...formData, joiningDate: text })}
                  placeholder="e.g., 1 August 2010"
                />
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleAddEdit}>
                <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>
                  {editingTeacher ? "Update Teacher" : "Add Teacher"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>

      {/* Modal already here */}
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
    elevation: 3,
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E293B",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 20,
    backgroundColor: "#4C6EF5",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scroll: {
    flex: 1,
  },
  list: {
    padding: 20,
    gap: 16,
  },
  teacherCard: {
    padding: 20,
    borderRadius: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  teacherInfo: {
    flex: 1,
  },
  teacherName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 4,
  },
  teacherId: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  cardContent: {
    marginBottom: 16,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#64748B",
    flex: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  statChip: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingVertical: 12,
    borderRadius: 12,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    paddingVertical: 12,
    borderRadius: 12,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
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
  },
  modalScroll: {
    maxHeight: "80%",
  },
  formField: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
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
  },
  saveButton: {
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

