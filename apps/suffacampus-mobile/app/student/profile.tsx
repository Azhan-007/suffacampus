import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { apiFetch } from "../../services/api";

interface ProfileData {
  name: string;
  admissionNumber: string;
  class: string;
  rollNo: string;
  section: string;
  email: string;
  phone: string;
  alternatePhone: string;
  dateOfBirth: string;
  age: string;
  gender: string;
  bloodGroup: string;
  nationality: string;
  religion: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyContact: string;
  emergencyContactName: string;
  emergencyRelation: string;
  medicalConditions: string;
  allergies: string;
  previousSchool: string;
  admissionDate: string;
  fatherName: string;
  fatherPhone: string;
  fatherEmail: string;
  fatherOccupation: string;
  fatherWorkplace: string;
  motherName: string;
  motherPhone: string;
  motherEmail: string;
  motherOccupation: string;
  motherWorkplace: string;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianEmail: string;
  photoURL: string;
}

const emptyProfile: ProfileData = {
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
  photoURL: "",
};

export default function ProfileScreen() {
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({});
  const [profileData, setProfileData] = useState<ProfileData>(emptyProfile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      let studentId = await AsyncStorage.getItem("studentId");
      if (!studentId) {
        try {
          const { getMyProfile } = await import("../../services/authService");
          const profile = await getMyProfile();
          if (profile.studentId) {
            studentId = profile.studentId;
            await AsyncStorage.setItem("studentId", profile.studentId);
          }
        } catch { /* ignore */ }
      }
      if (!studentId) return;
      const raw = await apiFetch<any>(`/students/${studentId}`);

      // Resolve classId to human-readable class name + section name
      let className = "";
      let sectionName = "";
      if (raw.classId) {
        try {
          const classData = await apiFetch<any>(`/classes/${raw.classId}`);
          className = classData.className ?? "";
          if (raw.sectionId && classData.sections) {
            const sec = classData.sections.find(
              (s: any) => s.id === raw.sectionId
            );
            sectionName = sec?.sectionName ?? "";
          }
        } catch { /* class lookup failed */ }
      }

      // Format date of birth
      let dob = raw.dateOfBirth ?? "";
      if (dob) {
        try {
          const d = new Date(dob);
          if (!isNaN(d.getTime())) {
            dob = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          }
        } catch { /* keep raw */ }
      }

      // Format admission date
      let admDate = raw.admissionDate ?? raw.enrollmentDate ?? raw.createdAt ?? "";
      if (admDate) {
        try {
          const d = new Date(typeof admDate === "object" && admDate._seconds ? admDate._seconds * 1000 : admDate);
          if (!isNaN(d.getTime())) {
            admDate = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          }
        } catch { /* keep raw */ }
      }

      setProfileData({
        name: `${raw.firstName ?? ""} ${raw.lastName ?? ""}`.trim(),
        admissionNumber: raw.rollNumber ?? "",
        class: className,
        rollNo: raw.rollNumber ?? "",
        section: sectionName,
        email: raw.email ?? "",
        phone: raw.phone ?? raw.parentPhone ?? "",
        alternatePhone: raw.alternatePhone ?? "",
        dateOfBirth: dob,
        age: raw.age ?? "",
        gender: raw.gender ?? "",
        bloodGroup: raw.bloodGroup ?? "",
        nationality: raw.nationality ?? "",
        religion: raw.religion ?? "",
        address: raw.address ?? "",
        city: raw.city ?? "",
        state: raw.state ?? "",
        postalCode: raw.postalCode ?? "",
        emergencyContact: raw.emergencyContact ?? "",
        emergencyContactName: raw.emergencyContactName ?? "",
        emergencyRelation: raw.emergencyRelation ?? "",
        medicalConditions: raw.medicalConditions ?? "",
        allergies: raw.allergies ?? "",
        previousSchool: raw.previousSchool ?? "",
        admissionDate: admDate,
        fatherName: raw.fatherName ?? "",
        fatherPhone: raw.fatherPhone ?? "",
        fatherEmail: raw.fatherEmail ?? "",
        fatherOccupation: raw.fatherOccupation ?? "",
        fatherWorkplace: raw.fatherWorkplace ?? "",
        motherName: raw.motherName ?? "",
        motherPhone: raw.motherPhone ?? "",
        motherEmail: raw.motherEmail ?? "",
        motherOccupation: raw.motherOccupation ?? "",
        motherWorkplace: raw.motherWorkplace ?? "",
        guardianName: raw.guardianName ?? "",
        guardianRelation: raw.guardianRelation ?? "",
        guardianPhone: raw.guardianPhone ?? "",
        guardianEmail: raw.guardianEmail ?? "",
        photoURL: raw.photoURL ?? "",
      });
    } catch (error) {
      console.warn("Failed to fetch profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem("role");
    router.replace("/login" as any);
  };

  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.mainContent}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" color="#4C6EF5" />
            <Text style={{ marginTop: 12, color: "#6B7280", fontSize: 16 }}>Loading profile...</Text>
          </View>
        ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header with Gradient Background */}
          <View style={styles.headerContainer}>
            <View style={styles.headerGradient}>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>My Profile</Text>
              </View>
            </View>

            {/* Profile Card with Avatar */}
            <View style={styles.profileCardContainer}>
              <Card style={styles.profileCard}>
                <View style={styles.avatarSection}>
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatar}>
                      {profileData.photoURL ? (
                        <Image source={{ uri: profileData.photoURL }} style={{ width: 100, height: 100, borderRadius: 50 }} />
                      ) : (
                        <MaterialCommunityIcons name="account" size={60} color="#4C6EF5" />
                      )}
                    </View>
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.studentName}>{profileData.name || "—"}</Text>
                    <Text style={styles.admissionNumber}>{profileData.admissionNumber || "—"}</Text>
                    <View style={styles.classBadge}>
                      <MaterialCommunityIcons name="google-classroom" size={14} color="#4C6EF5" />
                      <Text style={styles.classText}>{profileData.class} • Roll No: {profileData.rollNo}</Text>
                    </View>
                  </View>
                </View>
              </Card>
            </View>
          </View>

          {/* Personal Information */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("personal")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="account-details" size={20} color="#4C6EF5" />
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.personal ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.personal && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="email" size={20} color="#4C6EF5" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profileData.email}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="phone" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{profileData.phone}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="phone-outline" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Alternate Phone</Text>
                  <Text style={styles.infoValue}>{profileData.alternatePhone}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="cake-variant" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Date of Birth</Text>
                  <Text style={styles.infoValue}>{profileData.dateOfBirth} ({profileData.age})</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="gender-male-female" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Gender</Text>
                  <Text style={styles.infoValue}>{profileData.gender}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="water" size={20} color="#EF4444" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Blood Group</Text>
                  <Text style={styles.infoValue}>{profileData.bloodGroup}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="flag" size={20} color="#3B82F6" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Nationality</Text>
                  <Text style={styles.infoValue}>{profileData.nationality}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="star-crescent" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Religion</Text>
                  <Text style={styles.infoValue}>{profileData.religion}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="map-marker" size={20} color="#EF4444" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{profileData.address}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="city" size={20} color="#6366F1" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>City / State</Text>
                  <Text style={styles.infoValue}>{profileData.city}, {profileData.state} - {profileData.postalCode}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Emergency Contact */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("emergency")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="phone-alert" size={20} color="#EF4444" />
                <Text style={styles.sectionTitle}>Emergency Contact</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.emergency ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.emergency && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="account-alert" size={20} color="#EF4444" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Contact Name</Text>
                  <Text style={styles.infoValue}>{profileData.emergencyContactName}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="phone-alert" size={20} color="#EF4444" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Emergency Phone</Text>
                  <Text style={styles.infoValue}>{profileData.emergencyContact}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="account-heart" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Relation</Text>
                  <Text style={styles.infoValue}>{profileData.emergencyRelation}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Medical Information */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("medical")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="medical-bag" size={20} color="#EF4444" />
                <Text style={styles.sectionTitle}>Medical Information</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.medical ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.medical && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="medical-bag" size={20} color="#EF4444" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Medical Conditions</Text>
                  <Text style={styles.infoValue}>{profileData.medicalConditions}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="alert-circle" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Allergies</Text>
                  <Text style={styles.infoValue}>{profileData.allergies}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Academic Information */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("academic")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="school" size={20} color="#4C6EF5" />
                <Text style={styles.sectionTitle}>Academic Information</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.academic ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.academic && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="school" size={20} color="#4C6EF5" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Previous School</Text>
                  <Text style={styles.infoValue}>{profileData.previousSchool}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="calendar-check" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Admission Date</Text>
                  <Text style={styles.infoValue}>{profileData.admissionDate}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="book-education" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Section</Text>
                  <Text style={styles.infoValue}>{profileData.section}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Father Information */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("father")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="account-tie" size={20} color="#4C6EF5" />
                <Text style={styles.sectionTitle}>Father Information</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.father ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.father && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="account-tie" size={20} color="#4C6EF5" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{profileData.fatherName}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="phone" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{profileData.fatherPhone}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="email" size={20} color="#4C6EF5" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profileData.fatherEmail}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="briefcase" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Occupation</Text>
                  <Text style={styles.infoValue}>{profileData.fatherOccupation}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="office-building" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Workplace</Text>
                  <Text style={styles.infoValue}>{profileData.fatherWorkplace}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Mother Information */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("mother")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="account-tie" size={20} color="#EC4899" />
                <Text style={styles.sectionTitle}>Mother Information</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.mother ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.mother && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="account-tie" size={20} color="#EC4899" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{profileData.motherName}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="phone" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{profileData.motherPhone}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="email" size={20} color="#EC4899" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profileData.motherEmail}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="briefcase" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Occupation</Text>
                  <Text style={styles.infoValue}>{profileData.motherOccupation}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="office-building" size={20} color="#8B5CF6" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Workplace</Text>
                  <Text style={styles.infoValue}>{profileData.motherWorkplace}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Guardian Information */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection("guardian")}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="shield-account" size={20} color="#10B981" />
                <Text style={styles.sectionTitle}>Guardian Information</Text>
              </View>
              <MaterialCommunityIcons
                name={expandedSections.guardian ? "chevron-up" : "chevron-down"}
                size={24}
                color="#9CA3AF"
              />
            </TouchableOpacity>
            {expandedSections.guardian && (
              <Card style={styles.infoCard}>
              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="shield-account" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Guardian Name</Text>
                  <Text style={styles.infoValue}>{profileData.guardianName}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="account-heart" size={20} color="#F59E0B" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Relation</Text>
                  <Text style={styles.infoValue}>{profileData.guardianRelation}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="phone" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{profileData.guardianPhone}</Text>
                </View>
              </View>

              <View style={styles.infoDivider} />

              <View style={styles.infoItem}>
                <View style={styles.infoIconContainer}>
                  <MaterialCommunityIcons name="email" size={20} color="#10B981" />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profileData.guardianEmail}</Text>
                </View>
              </View>
            </Card>
            )}
          </View>

          {/* Logout Button */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={22} color="#FFFFFF" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
        )}
      </View>

      {/* PREMIUM FLOATING BOTTOM NAVIGATION */}
      <SafeAreaView edges={["bottom"]} style={styles.floatingNavContainer}>
        <View style={styles.floatingNav}>
          {/* Home (inactive) */}
          <Pressable style={styles.navItem} onPress={() => router.push('/student/dashboard' as any)}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="home-outline" size={24} color="#D1D5DB" />
              </View>
            )}
          </Pressable>
          {/* Grid (inactive) */}
          <Pressable style={styles.navItem} onPress={() => router.push('/student/menu' as any)}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="view-grid-outline" size={24} color="#D1D5DB" />
              </View>
            )}
          </Pressable>
          {/* Account (active) */}
          <Pressable style={styles.navItemActive} onPress={() => {}}>
            {({ pressed }) => (
              <View style={[styles.activeNavFilled, { opacity: pressed ? 0.6 : 1 }]}> 
                <MaterialCommunityIcons name="account" size={24} color="#FFFFFF" />
                <Text style={styles.navLabelActive}>Profile</Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  mainContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  headerContainer: {
    marginBottom: 20,
  },
  headerGradient: {
    backgroundColor: "#4C6EF5",
    paddingTop: 20,
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileCardContainer: {
    marginTop: -60,
    paddingHorizontal: 20,
  },
  profileCard: {
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 16,
  },
  avatarBorder: {
    padding: 4,
    borderRadius: 60,
    backgroundColor: "#FFFFFF",
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(76, 110, 245, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraButton: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  profileInfo: {
    alignItems: "center",
  },
  studentName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 6,
  },
  admissionNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  classBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  classText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickActionCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  infoCard: {
    padding: 20,
    elevation: 3,
  },
  infoItem: {
    flexDirection: "row",
    gap: 16,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  infoDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 16,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#EF4444",
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoutText: {
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
    paddingHorizontal: 0,
  },
  floatingNav: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    elevation: 0,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    height: 60,
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
