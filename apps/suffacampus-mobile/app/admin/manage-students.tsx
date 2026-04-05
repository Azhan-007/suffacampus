import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { apiFetch } from "../../services/api";

interface Student {
  id: string;
  name: string;
  admissionNumber: string;
  class: string;
  rollNo: string;
  email: string;
  phone: string;
  status: "active" | "inactive";
}

export default function ManageStudentsScreen() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<Student[]>("/students");
      setStudents(data);
    } catch (error) {
      console.warn("Error fetching students:", error);
      Alert.alert("Error", "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  // Detailed student profile for editing
  const [profileData, setProfileData] = useState({
    // Basic Info
    name: "",
    admissionNumber: "",
    class: "",
    rollNo: "",
    section: "",
    email: "",
    phone: "",
    alternatePhone: "",
    dateOfBirth: "",
    age: "",
    gender: "",
    bloodGroup: "",
    nationality: "",
    religion: "",
    
    // Address
    address: "",
    city: "",
    state: "",
    postalCode: "",
    
    // Emergency Contact
    emergencyContact: "",
    emergencyContactName: "",
    emergencyRelation: "",
    
    // Medical Info
    medicalConditions: "",
    allergies: "",
    
    // Academic Info
    previousSchool: "",
    admissionDate: "",
    
    // Father Info
    fatherName: "",
    fatherPhone: "",
    fatherEmail: "",
    fatherOccupation: "",
    fatherWorkplace: "",
    
    // Mother Info
    motherName: "",
    motherPhone: "",
    motherEmail: "",
    motherOccupation: "",
    motherWorkplace: "",
    
    // Guardian Info
    guardianName: "",
    guardianRelation: "",
    guardianPhone: "",
    guardianEmail: "",
  });

  const filteredStudents = students.filter(
    (student) =>
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.admissionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.class.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditStudent = (student: Student) => {
    setSelectedStudent(student);
    // Populate form from student data
    setProfileData({
      name: student.name,
      admissionNumber: student.admissionNumber,
      class: student.class,
      rollNo: student.rollNo,
      section: "",
      email: student.email,
      phone: student.phone,
      alternatePhone: "",
      dateOfBirth: "",
      age: "",
      gender: "",
      bloodGroup: "",
      nationality: "",
      religion: "",
      address: "",
      city: "",
      state: "",
      postalCode: "",
      emergencyContact: "",
      emergencyContactName: "",
      emergencyRelation: "",
      medicalConditions: "",
      allergies: "",
      previousSchool: "",
      admissionDate: "",
      fatherName: "",
      fatherPhone: "",
      fatherEmail: "",
      fatherOccupation: "",
      fatherWorkplace: "",
      motherName: "",
      motherPhone: "",
      motherEmail: "",
      motherOccupation: "",
      motherWorkplace: "",
      guardianName: "",
      guardianRelation: "",
      guardianPhone: "",
      guardianEmail: "",
    });
    setEditModalVisible(true);
  };

  const handleViewStudent = (student: Student) => {
    setSelectedStudent(student);
    setViewModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!selectedStudent) return;
    try {
      await apiFetch(`/students/${selectedStudent.id}`, {
        method: "PATCH",
        body: {
          name: profileData.name,
          class: profileData.class,
          rollNo: profileData.rollNo,
          email: profileData.email,
          phone: profileData.phone,
        },
      });
      Alert.alert("Success", "Student profile updated successfully!");
      setEditModalVisible(false);
      fetchStudents(); // Refresh list
    } catch (error) {
      console.warn("Error saving student:", error);
      Alert.alert("Error", "Failed to update student profile");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Students</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#6B7280", marginTop: 16 }}>Loading students...</Text>
        </View>
      ) : (
      <>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, admission number, or class..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <MaterialIcons name="close" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: "#DBEAFE" }]}>
            <MaterialCommunityIcons name="account-group" size={24} color="#3B82F6" />
          </View>
          <Text style={styles.statValue}>{students.length}</Text>
          <Text style={styles.statLabel}>Total Students</Text>
        </Card>

        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: "#D1FAE5" }]}>
            <MaterialCommunityIcons name="account-check" size={24} color="#10B981" />
          </View>
          <Text style={styles.statValue}>{students.filter((s) => s.status === "active").length}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </Card>

        <Card style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: "#FEE2E2" }]}>
            <MaterialCommunityIcons name="account-off" size={24} color="#EF4444" />
          </View>
          <Text style={styles.statValue}>{students.filter((s) => s.status === "inactive").length}</Text>
          <Text style={styles.statLabel}>Inactive</Text>
        </Card>
      </View>

      {/* Student List */}
      <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
        {filteredStudents.map((student) => (
          <Card key={student.id} style={styles.studentCard}>
            <View style={styles.studentHeader}>
              <View style={styles.avatarContainer}>
                <MaterialCommunityIcons name="account-circle" size={50} color="#4C6EF5" />
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.studentDetails}>{student.admissionNumber}</Text>
                <View style={styles.studentMeta}>
                  <MaterialCommunityIcons name="google-classroom" size={14} color="#6B7280" />
                  <Text style={styles.metaText}>{student.class}</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaText}>Roll No: {student.rollNo}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, student.status === "active" ? styles.statusActive : styles.statusInactive]}>
                <Text style={styles.statusText}>{student.status}</Text>
              </View>
            </View>

            <View style={styles.contactRow}>
              <View style={styles.contactItem}>
                <MaterialCommunityIcons name="email-outline" size={16} color="#6B7280" />
                <Text style={styles.contactText}>{student.email}</Text>
              </View>
              <View style={styles.contactItem}>
                <MaterialCommunityIcons name="phone-outline" size={16} color="#6B7280" />
                <Text style={styles.contactText}>{student.phone}</Text>
              </View>
            </View>

            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.viewButton]}
                onPress={() => handleViewStudent(student)}
              >
                <MaterialIcons name="visibility" size={18} color="#4C6EF5" />
                <Text style={styles.viewButtonText}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.editButton]}
                onPress={() => handleEditStudent(student)}
              >
                <MaterialIcons name="edit" size={18} color="#10B981" />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}

        {filteredStudents.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-search" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No students found</Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
      </>
      )}

      {/* Edit Profile Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Student Profile</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <MaterialIcons name="close" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Basic Information */}
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={profileData.name}
                onChangeText={(text) => setProfileData({ ...profileData, name: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Admission Number"
                value={profileData.admissionNumber}
                onChangeText={(text) => setProfileData({ ...profileData, admissionNumber: text })}
              />
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Class"
                  value={profileData.class}
                  onChangeText={(text) => setProfileData({ ...profileData, class: text })}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Roll No"
                  value={profileData.rollNo}
                  onChangeText={(text) => setProfileData({ ...profileData, rollNo: text })}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Section"
                value={profileData.section}
                onChangeText={(text) => setProfileData({ ...profileData, section: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                value={profileData.email}
                keyboardType="email-address"
                onChangeText={(text) => setProfileData({ ...profileData, email: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone"
                value={profileData.phone}
                keyboardType="phone-pad"
                onChangeText={(text) => setProfileData({ ...profileData, phone: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Alternate Phone"
                value={profileData.alternatePhone}
                keyboardType="phone-pad"
                onChangeText={(text) => setProfileData({ ...profileData, alternatePhone: text })}
              />
            </Card>

            {/* Personal Details */}
            <Text style={styles.sectionTitle}>Personal Details</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Date of Birth (DD Month YYYY)"
                value={profileData.dateOfBirth}
                onChangeText={(text) => setProfileData({ ...profileData, dateOfBirth: text })}
              />
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Age"
                  value={profileData.age}
                  onChangeText={(text) => setProfileData({ ...profileData, age: text })}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Gender"
                  value={profileData.gender}
                  onChangeText={(text) => setProfileData({ ...profileData, gender: text })}
                />
              </View>
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Blood Group"
                  value={profileData.bloodGroup}
                  onChangeText={(text) => setProfileData({ ...profileData, bloodGroup: text })}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Nationality"
                  value={profileData.nationality}
                  onChangeText={(text) => setProfileData({ ...profileData, nationality: text })}
                />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Religion"
                value={profileData.religion}
                onChangeText={(text) => setProfileData({ ...profileData, religion: text })}
              />
            </Card>

            {/* Address */}
            <Text style={styles.sectionTitle}>Address</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Full Address"
                value={profileData.address}
                multiline
                numberOfLines={3}
                onChangeText={(text) => setProfileData({ ...profileData, address: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="City"
                value={profileData.city}
                onChangeText={(text) => setProfileData({ ...profileData, city: text })}
              />
              <View style={styles.rowInputs}>
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="State"
                  value={profileData.state}
                  onChangeText={(text) => setProfileData({ ...profileData, state: text })}
                />
                <TextInput
                  style={[styles.input, styles.halfInput]}
                  placeholder="Postal Code"
                  value={profileData.postalCode}
                  keyboardType="numeric"
                  onChangeText={(text) => setProfileData({ ...profileData, postalCode: text })}
                />
              </View>
            </Card>

            {/* Emergency Contact */}
            <Text style={styles.sectionTitle}>Emergency Contact</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Emergency Contact Name"
                value={profileData.emergencyContactName}
                onChangeText={(text) => setProfileData({ ...profileData, emergencyContactName: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Emergency Phone"
                value={profileData.emergencyContact}
                keyboardType="phone-pad"
                onChangeText={(text) => setProfileData({ ...profileData, emergencyContact: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Relation"
                value={profileData.emergencyRelation}
                onChangeText={(text) => setProfileData({ ...profileData, emergencyRelation: text })}
              />
            </Card>

            {/* Medical Information */}
            <Text style={styles.sectionTitle}>Medical Information</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Medical Conditions (None if not applicable)"
                value={profileData.medicalConditions}
                onChangeText={(text) => setProfileData({ ...profileData, medicalConditions: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Allergies (None if not applicable)"
                value={profileData.allergies}
                onChangeText={(text) => setProfileData({ ...profileData, allergies: text })}
              />
            </Card>

            {/* Academic Information */}
            <Text style={styles.sectionTitle}>Academic Information</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Previous School"
                value={profileData.previousSchool}
                onChangeText={(text) => setProfileData({ ...profileData, previousSchool: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Admission Date (DD Month YYYY)"
                value={profileData.admissionDate}
                onChangeText={(text) => setProfileData({ ...profileData, admissionDate: text })}
              />
            </Card>

            {/* Father Information */}
            <Text style={styles.sectionTitle}>Father Information</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Father's Name"
                value={profileData.fatherName}
                onChangeText={(text) => setProfileData({ ...profileData, fatherName: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Father's Phone"
                value={profileData.fatherPhone}
                keyboardType="phone-pad"
                onChangeText={(text) => setProfileData({ ...profileData, fatherPhone: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Father's Email"
                value={profileData.fatherEmail}
                keyboardType="email-address"
                onChangeText={(text) => setProfileData({ ...profileData, fatherEmail: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Father's Occupation"
                value={profileData.fatherOccupation}
                onChangeText={(text) => setProfileData({ ...profileData, fatherOccupation: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Father's Workplace"
                value={profileData.fatherWorkplace}
                onChangeText={(text) => setProfileData({ ...profileData, fatherWorkplace: text })}
              />
            </Card>

            {/* Mother Information */}
            <Text style={styles.sectionTitle}>Mother Information</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Mother's Name"
                value={profileData.motherName}
                onChangeText={(text) => setProfileData({ ...profileData, motherName: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Mother's Phone"
                value={profileData.motherPhone}
                keyboardType="phone-pad"
                onChangeText={(text) => setProfileData({ ...profileData, motherPhone: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Mother's Email"
                value={profileData.motherEmail}
                keyboardType="email-address"
                onChangeText={(text) => setProfileData({ ...profileData, motherEmail: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Mother's Occupation"
                value={profileData.motherOccupation}
                onChangeText={(text) => setProfileData({ ...profileData, motherOccupation: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Mother's Workplace"
                value={profileData.motherWorkplace}
                onChangeText={(text) => setProfileData({ ...profileData, motherWorkplace: text })}
              />
            </Card>

            {/* Guardian Information */}
            <Text style={styles.sectionTitle}>Guardian Information</Text>
            <Card style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Guardian Name"
                value={profileData.guardianName}
                onChangeText={(text) => setProfileData({ ...profileData, guardianName: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Relation to Student"
                value={profileData.guardianRelation}
                onChangeText={(text) => setProfileData({ ...profileData, guardianRelation: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Guardian Phone"
                value={profileData.guardianPhone}
                keyboardType="phone-pad"
                onChangeText={(text) => setProfileData({ ...profileData, guardianPhone: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Guardian Email"
                value={profileData.guardianEmail}
                keyboardType="email-address"
                onChangeText={(text) => setProfileData({ ...profileData, guardianEmail: text })}
              />
            </Card>

            {/* Save Button */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
              <MaterialIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Bottom Navigation */}
      <SafeAreaView edges={["bottom"]} style={styles.floatingNavContainer}>
        <View style={styles.floatingNav}>
          <Pressable style={styles.navItem} onPress={() => router.push("/admin/dashboard" as any)}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="view-dashboard-outline" size={24} color="#D1D5DB" />
              </View>
            )}
          </Pressable>
          <Pressable style={styles.navItemActive}>
            {({ pressed }) => (
              <View style={[styles.activeNavFilled, { opacity: pressed ? 0.6 : 1 }]}>
                <MaterialCommunityIcons name="account-group" size={24} color="#FFFFFF" />
                <Text style={styles.navLabelActive}>Students</Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
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
    borderBottomColor: "#F3F4F6",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  placeholder: {
    width: 32,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#1A1A1A",
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 16,
    alignItems: "center",
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  studentCard: {
    padding: 16,
    marginBottom: 12,
  },
  studentHeader: {
    flexDirection: "row",
    marginBottom: 12,
  },
  avatarContainer: {
    marginRight: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  studentDetails: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  studentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: "#6B7280",
  },
  metaDivider: {
    fontSize: 12,
    color: "#D1D5DB",
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    height: 28,
  },
  statusActive: {
    backgroundColor: "#D1FAE5",
  },
  statusInactive: {
    backgroundColor: "#FEE2E2",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  contactRow: {
    gap: 8,
    marginBottom: 12,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactText: {
    fontSize: 13,
    color: "#6B7280",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  viewButton: {
    backgroundColor: "#EFF6FF",
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  editButton: {
    backgroundColor: "#D1FAE5",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10B981",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#9CA3AF",
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 12,
    marginTop: 8,
  },
  formCard: {
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1A1A1A",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  rowInputs: {
    flexDirection: "row",
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4C6EF5",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  bottomSpacer: {
    height: 100,
  },
  floatingNavContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  floatingNav: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    height: 60,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  navItemActive: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  activeNavFilled: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#4C6EF5",
    gap: 8,
  },
  navLabelActive: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
