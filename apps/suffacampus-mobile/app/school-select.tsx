import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../components/Card";
import { SCHOOL_CONFIG } from "../config/school.config";
import { auth } from "../firebase";
import { verifySchoolCode as apiVerifySchoolCode } from "../services/authService";

export default function SchoolSelect() {
  const [schoolCode, setSchoolCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const savedSchoolId = await AsyncStorage.getItem("schoolId");
      const savedRole = await AsyncStorage.getItem("role");
      
      // Only auto-navigate if BOTH AsyncStorage session AND Firebase auth are valid
      const firebaseUser = auth.currentUser;
      if (savedSchoolId && savedRole && firebaseUser) {
        if (savedRole === "student") {
          router.replace("/student/dashboard" as any);
        } else if (savedRole === "teacher") {
          router.replace("/teacher/dashboard" as any);
        } else if (savedRole === "admin") {
          router.replace("/admin/dashboard" as any);
        }
      } else if (savedRole && !firebaseUser) {
        // Stale session — clear it
        await AsyncStorage.multiRemove([
          "role",
          "userEmail",
          "userName",
          "username",
          "userId",
          "studentId",
          "SuffaCampus-session-access-token",
          "SuffaCampus-session-access-token-uid",
        ]);
      }
    } catch (error) {
      console.warn("Session check error:", error);
    } finally {
      setCheckingSession(false);
    }
  };

  const verifySchoolCode = async () => {
    if (!schoolCode.trim()) {
      setError("Please enter your school code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const schoolData = await apiVerifySchoolCode(schoolCode.toUpperCase().trim());

      await AsyncStorage.setItem("schoolId", schoolData.id);
      await AsyncStorage.setItem("schoolCode", schoolData.code);
      await AsyncStorage.setItem("schoolName", schoolData.name);

      // Save optional branding/contact fields if returned by the backend
      if (schoolData.supportEmail) await AsyncStorage.setItem("schoolSupportEmail", schoolData.supportEmail);
      if (schoolData.supportPhone) await AsyncStorage.setItem("schoolSupportPhone", schoolData.supportPhone);
      if (schoolData.helpUrl) await AsyncStorage.setItem("schoolHelpUrl", schoolData.helpUrl);
      if (schoolData.tagline) await AsyncStorage.setItem("schoolTagline", schoolData.tagline);
      if (schoolData.primaryColor) await AsyncStorage.setItem("schoolPrimaryColor", schoolData.primaryColor);
      
      router.push("/login" as any);
    } catch (error: any) {
      console.warn("School verification error:", error);
      const msg = error?.message || "Failed to verify school code. Please try again.";
      setError(msg.includes("not found") ? "Invalid school code. Please check and try again." : msg);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color="#4C6EF5" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            {SCHOOL_CONFIG.logo.useIcon ? (
              <MaterialCommunityIcons 
                name={SCHOOL_CONFIG.logo.iconName as any} 
                size={48} 
                color={SCHOOL_CONFIG.logo.iconColor} 
              />
            ) : (
              <Image 
                source={{ uri: (SCHOOL_CONFIG.logo as any).imageUrl }} 
                style={styles.logoImage}
                resizeMode="contain"
              />
            )}
          </View>
          <Text style={styles.appName}>{SCHOOL_CONFIG.name}</Text>
          <Text style={styles.tagline}>{SCHOOL_CONFIG.tagline}</Text>
        </View>

        {/* School Code Card */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Enter School Code</Text>
          <Text style={styles.cardSubtitle}>
            Enter your school&apos;s unique code to continue
          </Text>

          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="key-variant" size={20} color="#64748B" />
            <TextInput
              style={styles.input}
              placeholder="e.g., SCHOOL2024"
              placeholderTextColor="#94A3B8"
              value={schoolCode}
              onChangeText={(text) => {
                setSchoolCode(text.toUpperCase());
                setError("");
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={verifySchoolCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.buttonText}>Continue</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>
        </Card>

        {/* Help Text */}
        <View style={styles.helpSection}>
          <MaterialCommunityIcons name="help-circle-outline" size={18} color="#64748B" />
          <Text style={styles.helpText}>
            Contact your school administration if you don&apos;t have a code
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 16,
    overflow: "hidden",
  },
  logoImage: {
    width: 80,
    height: 80,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4,
  },
  card: {
    padding: 24,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 24,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    paddingVertical: 14,
    letterSpacing: 1,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#EF4444",
  },
  button: {
    backgroundColor: "#4C6EF5",
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: "#94A3B8",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  helpSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  helpText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    flex: 1,
  },
});
