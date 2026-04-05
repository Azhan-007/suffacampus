import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { getTeacherProfile, TeacherProfile } from "../../services/teacherService";

type Teacher = TeacherProfile;

export default function TeacherProfileScreen() {
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<Teacher | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProfileData = async () => {
    try {
      setError(null);
      setLoading(true);
      const teacherId = await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId");
      if (!teacherId) { router.replace("/login" as any); return; }
      const data = await getTeacherProfile(teacherId);
      setProfileData(data);
    } catch (err) {
      console.warn("Error fetching profile:", err);
      setError("Failed to load profile. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    router.replace("/login" as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Profile data will always be available (either from Firebase or mock data)
  if (!profileData) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={[styles.loadingText, { color: "#EF4444", marginTop: 12 }]}>
            {error || "Could not load profile"}
          </Text>
          <TouchableOpacity
            onPress={fetchProfileData}
            style={{ marginTop: 16, backgroundColor: "#4C6EF5", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: "#FFF", fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sections = [
    {
      key: "personal",
      title: "Personal Information",
      icon: "account" as const,
      data: [
        { label: "Full Name", value: profileData.name, icon: "account-circle" },
        { label: "Employee ID", value: profileData.employeeId, icon: "badge-account-horizontal" },
        { label: "Date of Birth", value: profileData.dateOfBirth, icon: "calendar" },
        { label: "Gender", value: profileData.gender, icon: "gender-male-female" },
        { label: "Blood Group", value: profileData.bloodGroup, icon: "water" },
        { label: "Nationality", value: profileData.nationality, icon: "flag" },
        { label: "Religion", value: profileData.religion, icon: "book-open-page-variant" },
      ],
    },
    {
      key: "address",
      title: "Address",
      icon: "map-marker" as const,
      data: [
        { label: "Address", value: profileData.address, icon: "home" },
        { label: "City", value: profileData.city, icon: "city" },
        { label: "State", value: profileData.state, icon: "map" },
        { label: "Postal Code", value: profileData.postalCode, icon: "mailbox" },
      ],
    },
    {
      key: "professional",
      title: "Professional Information",
      icon: "briefcase" as const,
      data: [
        { label: "Designation", value: profileData.designation, icon: "account-tie" },
        { label: "Department", value: profileData.department, icon: "office-building" },
        { label: "Qualification", value: profileData.qualification, icon: "school" },
        { label: "Specialization", value: profileData.specialization, icon: "star-circle" },
        { label: "Experience", value: profileData.experience, icon: "briefcase-clock" },
        { label: "Joining Date", value: profileData.joiningDate, icon: "calendar-check" },
        { label: "Employment Type", value: profileData.employmentType, icon: "account-check" },
        { label: "Previous School", value: profileData.previousSchool, icon: "home-city" },
      ],
    },
    {
      key: "teaching",
      title: "Teaching Details",
      icon: "human-male-board" as const,
      data: [
        { label: "Classes Assigned", value: profileData.classesAssigned?.join(", ") || "N/A", icon: "google-classroom" },
        { label: "Subjects", value: profileData.subjects?.join(", ") || "N/A", icon: "book-open-variant" },
        { label: "Total Students", value: profileData.totalStudents?.toString() || "0", icon: "account-group" },
        { label: "Working Hours", value: profileData.workingHours, icon: "clock-outline" },
      ],
    },
    {
      key: "bank",
      title: "Bank Details",
      icon: "bank" as const,
      data: [
        { label: "Bank Name", value: profileData.bankName, icon: "bank" },
        { label: "Account Number", value: profileData.accountNumber, icon: "numeric" },
        { label: "Account Holder", value: profileData.accountHolderName, icon: "account" },
        { label: "IFSC Code", value: profileData.ifscCode, icon: "code-tags" },
      ],
    },
    {
      key: "emergency",
      title: "Emergency Contact",
      icon: "phone-alert" as const,
      data: [
        { label: "Contact Name", value: profileData.emergencyContactName, icon: "account" },
        { label: "Contact Number", value: profileData.emergencyContact, icon: "phone" },
        { label: "Relation", value: profileData.emergencyRelation, icon: "account-heart" },
      ],
    },
    {
      key: "other",
      title: "Other Details",
      icon: "information" as const,
      data: [
        { label: "Languages", value: profileData.languages?.join(", ") || "N/A", icon: "translate" },
        { label: "Hobbies", value: profileData.hobbies?.join(", ") || "N/A", icon: "heart" },
        { label: "Achievements", value: profileData.achievements, icon: "trophy" },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Header Card */}
        <Card style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="account" size={60} color="#4C6EF5" />
            </View>
          </View>
          <Text style={styles.name}>{profileData.name}</Text>
          <Text style={styles.employeeId}>{profileData.employeeId}</Text>
          <View style={styles.designationBadge}>
            <MaterialCommunityIcons name="briefcase" size={16} color="#4C6EF5" />
            <Text style={styles.designationText}>
              {profileData.designation} • {profileData.department}
            </Text>
          </View>
          <View style={styles.contactRow}>
            <View style={styles.contactItem}>
              <MaterialCommunityIcons name="email" size={18} color="#64748B" />
              <Text style={styles.contactText}>{profileData.email}</Text>
            </View>
            <View style={styles.contactItem}>
              <MaterialCommunityIcons name="phone" size={18} color="#64748B" />
              <Text style={styles.contactText}>{profileData.phone}</Text>
            </View>
          </View>
        </Card>

        {/* Sections */}
        {sections.map((section) => (
          <Card key={section.key} style={styles.sectionCard}>
            <Pressable onPress={() => toggleSection(section.key)} style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name={section.icon} size={22} color="#4C6EF5" />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections[section.key] ? "chevron-up" : "chevron-down"}
                size={24}
                color="#94A3B8"
              />
            </Pressable>

            {expandedSections[section.key] && (
              <View style={styles.sectionContent}>
                {section.data.map((item, index) => (
                  <View key={index} style={styles.dataRow}>
                    <View style={styles.dataLabelRow}>
                      <MaterialCommunityIcons name={item.icon as any} size={18} color="#64748B" />
                      <Text style={styles.dataLabel}>{item.label}</Text>
                    </View>
                    <Text style={styles.dataValue}>{item.value || "N/A"}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
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
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  logoutButton: {
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
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  profileCard: {
    marginTop: 20,
    marginBottom: 16,
    padding: 24,
    alignItems: "center",
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  name: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  employeeId: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 12,
  },
  designationBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 20,
  },
  designationText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  contactRow: {
    width: "100%",
    gap: 12,
  },
  contactItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  contactText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    flex: 1,
  },
  sectionCard: {
    marginBottom: 16,
    padding: 0,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.3,
  },
  sectionContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  dataRow: {
    gap: 8,
  },
  dataLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dataLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dataValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    paddingLeft: 26,
  },
});
