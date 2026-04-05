import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../components/Card";
import { SCHOOL_CONFIG, getSchoolConfig } from "../config/school.config";
import { auth } from "../firebase";
import { getUserByUsername } from "../services/authService";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [schoolName, setSchoolName] = useState(SCHOOL_CONFIG.name);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [schoolConfig, setSchoolConfig] = useState(SCHOOL_CONFIG);

  useEffect(() => {
    loadSchoolInfo();
  }, []);

  const loadSchoolInfo = async () => {
    const config = await getSchoolConfig();
    setSchoolConfig(config);
    setSchoolName(config.name);
  };

  const handleForgotPassword = async () => {
    Alert.alert(
      "Reset Password",
      "Please contact your school administrator to reset your password.",
      [
        {
          text: "Contact Admin",
          onPress: () => {
            Linking.openURL(`mailto:${schoolConfig.contact.supportEmail}?subject=Password Reset Request&body=Username: ${username}`);
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleSupport = () => {
    const options = [
      {
        text: "Email Support",
        onPress: () => {
          Linking.openURL(`mailto:${schoolConfig.contact.supportEmail}?subject=Support Request`);
        },
      },
      {
        text: "Call Support",
        onPress: () => {
          Linking.openURL(`tel:${schoolConfig.contact.supportPhone}`);
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ];

    Alert.alert("Contact Support", "How would you like to reach us?", options);
  };

  const handleHelp = () => {
    const options = [
      {
        text: "Visit Help Center",
        onPress: () => {
          if (schoolConfig.contact.helpUrl) {
            Linking.openURL(schoolConfig.contact.helpUrl);
          }
        },
      },
      {
        text: "Common Issues",
        onPress: () => {
          Alert.alert(
            "Common Issues",
            "• Forgot Password: Contact your administrator\n" +
            "• Wrong Credentials: Check username and password\n" +
            "• Account Not Found: Admin needs to create your account\n" +
            "• Network Error: Check your internet connection\n\n" +
            "Note: Usernames and passwords are provided by your school administrator.",
            [{ text: "OK" }]
          );
        },
      },
      { text: "Cancel", style: "cancel" as const },
    ];

    Alert.alert("Help & FAQs", "What do you need help with?", options);
  };

  const handleLogin = async () => {
    if (!username.trim()) {
      setError("Please enter your username");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Resolve email/role for the given username via API
      let userEmail: string;
      let userRole: string;
      let userName: string;
      let userStudentId: string | null = null;
      let userTeacherId: string | null = null;

      const input = username.trim().toLowerCase();

      if (input.includes("@")) {
        // User entered an email directly — skip username lookup
        userEmail = input;
        userRole = ""; // will be resolved after Firebase login
        userName = "User";
      } else {
        // Standard username → email lookup via API
        try {
          const userData = await getUserByUsername(input);
          userEmail = userData.email;
          userRole = userData.role;
          userName = userData.name || "User";
          userStudentId = userData.studentId ?? null;
          userTeacherId = userData.teacherId ?? null;
        } catch {
          setError("Invalid username or password");
          setLoading(false);
          return;
        }
      }

      // Authenticate with Firebase using email
      const userCredential = await signInWithEmailAndPassword(auth, userEmail, password);
      const user = userCredential.user;

      // If email login was used, resolve role from Firebase custom claims or backend
      if (!userRole) {
        const tokenResult = await user.getIdTokenResult();
        const claims = tokenResult.claims as { role?: string };
        userRole = (claims.role || "").toLowerCase();
        userName = user.displayName || "User";
      }

      // Normalise role to lowercase for comparison
      const roleLower = userRole.toLowerCase();

      // Store session data
      await AsyncStorage.setItem("role", roleLower);
      await AsyncStorage.setItem("userEmail", userEmail);
      await AsyncStorage.setItem("userName", userName);
      await AsyncStorage.setItem("username", username.trim().toLowerCase());
      await AsyncStorage.setItem("userId", user.uid);
      if (userStudentId) {
        await AsyncStorage.setItem("studentId", userStudentId);
      }
      if (userTeacherId) {
        await AsyncStorage.setItem("teacherId", userTeacherId);
      }

      // For email login, resolve teacherId/studentId from backend profile
      if (!userTeacherId && !userStudentId) {
        try {
          const { getMyProfile } = await import("../services/authService");
          const profile = await getMyProfile();
          if (profile.teacherId) {
            userTeacherId = profile.teacherId;
            await AsyncStorage.setItem("teacherId", profile.teacherId);
          }
          if (profile.studentId) {
            userStudentId = profile.studentId;
            await AsyncStorage.setItem("studentId", profile.studentId);
          }
        } catch (e) {
          console.warn("Could not fetch profile for teacherId/studentId:", e);
        }
      }

      // Flush any queued offline mutations (e.g., attendance marked while offline)
      import("../services/offlineSyncQueue")
        .then(({ flushOfflineQueue }) => flushOfflineQueue())
        .catch((e) => {
          console.warn("Could not flush offline queue after login:", e);
        });

      // Navigate based on role
      if (roleLower === "student") {
        router.replace("/student/dashboard" as any);
      } else if (roleLower === "teacher") {
        router.replace("/teacher/dashboard" as any);
      } else if (roleLower === "admin") {
        router.replace("/admin/dashboard" as any);
      } else {
        setError("Invalid account type.");
        await auth.signOut();
      }
    } catch (error: any) {
      console.warn("Login error:", error);
      
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
        setError("Invalid username or password");
      } else if (error.code === "auth/too-many-requests") {
        setError("Too many attempts. Try again later.");
      } else if (error.code === "auth/network-request-failed") {
        setError("Network error. Check your connection.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const goBack = async () => {
    await AsyncStorage.removeItem("schoolId");
    await AsyncStorage.removeItem("schoolCode");
    await AsyncStorage.removeItem("schoolName");
    router.replace("/school-select" as any);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={goBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
            </TouchableOpacity>
            <View style={styles.schoolBadge}>
              <MaterialCommunityIcons name="school" size={20} color="#4C6EF5" />
              <Text style={styles.schoolName} numberOfLines={1}>
                {schoolName || "Your School"}
              </Text>
            </View>
          </View>

          {/* Logo */}
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              {SCHOOL_CONFIG.logo.useIcon ? (
                <MaterialCommunityIcons 
                  name={SCHOOL_CONFIG.logo.iconName as any} 
                  size={56} 
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
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          {/* Login Form */}
          <Card style={styles.card}>
            {/* Username */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputContainer}>
                <MaterialCommunityIcons name="account-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your username"
                  placeholderTextColor="#94A3B8"
                  value={username}
                  onChangeText={(text) => {
                    setUsername(text);
                    setError("");
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <MaterialCommunityIcons name="lock-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError("");
                  }}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <MaterialCommunityIcons
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity 
              style={styles.forgotButton} 
              onPress={handleForgotPassword}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Error */}
            {error ? (
              <View style={styles.errorContainer}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </Card>

          {/* Help */}
          <View style={styles.helpRow}>
            <TouchableOpacity style={styles.helpButton} onPress={handleSupport}>
              <MaterialCommunityIcons name="headset" size={18} color="#64748B" />
              <Text style={styles.helpButtonText}>Support</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.helpButton} onPress={handleHelp}>
              <MaterialCommunityIcons name="help-circle-outline" size={18} color="#64748B" />
              <Text style={styles.helpButtonText}>Help</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 32,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  schoolBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  schoolName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 24,
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
  welcomeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
  },
  card: {
    padding: 24,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingHorizontal: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    paddingVertical: 14,
  },
  forgotButton: {
    alignSelf: "flex-end",
    marginBottom: 16,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
  button: {
    backgroundColor: "#4C6EF5",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: "#94A3B8",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  helpButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: "#E2E8F0",
  },
});
