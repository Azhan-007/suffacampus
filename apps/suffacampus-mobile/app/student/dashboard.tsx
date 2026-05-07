import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Image as ExpoImage } from "expo-image";

import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Dimensions, Easing, Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import Section from "../../components/Section";
import { auth } from "../../firebase";
import { apiFetch, clearSessionAccessToken } from "../../services/api";
import {
    getActiveEvents,
    getAppConfig,
    getAssignmentStats,
    getCarouselImages,
    getRecentResults,
  subscribeStudentDashboardActivities,
    getStudentDashboardActivities,
    getStudentInfo,
    getTodayAttendance,
} from "../../services/dashboardService";

// FavoritePressable: Animated pressable for Favorites grid
type FavoritePressableProps = {
  iconName: string;
  iconColor: string;
  bgColorActive: string;
  bgColorInactive: string;
  label: string;
  badge: string;
  iconSize?: number;
  onPress?: () => void;
};

type QuickAccessTileProps = {
  label: string;
  badge: string;
  route: string;
  iconName: string;
};

const QuickAccessTile = React.memo(function QuickAccessTile({ label, badge, route, iconName }: QuickAccessTileProps) {
  return (
    <TouchableOpacity
      style={[styles.quickAccessCard, { backgroundColor: "#EEF2FF" }]}
      onPress={() => router.push(route as any)}
      activeOpacity={0.7}
    >
      <View style={[styles.quickAccessIconWrapper, { backgroundColor: "#4C6EF5" }]}> 
        <MaterialCommunityIcons name={iconName as any} size={24} color="#FFFFFF" />
      </View>
      <Text style={styles.quickAccessLabel}>{label}</Text>
      <Text style={styles.quickAccessBadgeText}>{badge}</Text>
    </TouchableOpacity>
  );
});

function FavoritePressable({ iconName, iconColor, bgColorActive, bgColorInactive, label, badge, iconSize, onPress }: FavoritePressableProps) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = React.useState(false);
  const animateTo = (toValue: number) => {
    Animated.timing(scale, {
      toValue,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  return (
    <Pressable
      style={styles.favoriteItem}
      onPressIn={() => {
        setPressed(true);
        animateTo(0.96);
      }}
      onPressOut={() => {
        setPressed(false);
        animateTo(1);
      }}
      onPress={onPress}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={styles.favoriteIconWrapper}>
          <View style={[styles.iconCircle, { backgroundColor: pressed ? bgColorActive : bgColorInactive }]}> 
            <MaterialCommunityIcons name={iconName as any} size={typeof iconSize === 'number' ? iconSize : 28} color={iconColor} />
          </View>
        </View>
        <Text style={styles.favoriteLabel}>{label}</Text>
        <Text style={styles.favoriteBadge}>{badge}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.dashboardErrorContainer}>
        <Text style={styles.dashboardErrorTitle}>Unable to load dashboard</Text>
        <Text style={styles.dashboardErrorMessage}>{error.message}</Text>
        <TouchableOpacity style={styles.dashboardErrorRetry} onPress={retry} activeOpacity={0.8}>
          <Text style={styles.dashboardErrorRetryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function StudentDashboard() {
  const scrollY = useRef(0);
  const [parallax, setParallax] = useState(0);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [assignmentStats, setAssignmentStats] = useState({ pending: 0, submitted: 0 });
  const [attendanceData, setAttendanceData] = useState({ todayFN: "Not Marked", todayAN: "Not Marked", monthlyPercentage: 0 });
  const [currentSlide, setCurrentSlide] = useState(0);
  const [carouselImages, setCarouselImages] = useState<any[]>([]);
  const [resultsLimit, setResultsLimit] = useState(3); // Default to 3, configurable by admin
  const [events, setEvents] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [studentInfoLoading, setStudentInfoLoading] = useState(true);
  const [studentInfo, setStudentInfo] = useState({
    name: "",
    admissionNumber: "",
    class: "",
    section: "",
    photoURL: "",
  });
  const carouselScrollRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const carouselWidth = screenWidth - 40; // Same as card width (20px padding on each side)

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    scrollY.current = y;
    setParallax(y * 0.4); // subtle parallax factor
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.warn("Logout signOut error:", error);
    }

    await AsyncStorage.multiRemove([
      "role",
      "userEmail",
      "userName",
      "username",
      "userId",
      "studentId",
      "teacherId",
      "schoolId",
      "schoolCode",
      "schoolName",
    ]);
    await clearSessionAccessToken();
    router.replace("/login" as any);
  };

  const resolveStudentId = async (): Promise<string | null> => {
    let currentStudentId = await AsyncStorage.getItem("studentId");

    if (!currentStudentId) {
      try {
        const { getMyProfile } = await import("../../services/authService");
        const profile = await getMyProfile();
        if (profile.studentId) {
          currentStudentId = profile.studentId;
          await AsyncStorage.setItem("studentId", profile.studentId);
        }
      } catch {
        // profile fetch failed
      }
    }

    return currentStudentId;
  };

  useEffect(() => {
    const loadDashboardInParallel = async () => {
      await Promise.all([
        fetchConfig(),
        fetchStudentInfo(),
        fetchAssignmentStats(),
        fetchAttendanceData(),
        fetchCarouselImages(),
        fetchEvents(),
        fetchActivities(),
        fetchUnreadNotificationCount(),
      ]);
    };

    loadDashboardInParallel().catch((error) => {
      console.warn("Dashboard bootstrap failed", error);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const startRealtimeActivities = async () => {
      const currentStudentId = await resolveStudentId();
      if (!mounted || !currentStudentId) return;

      unsubscribe = await subscribeStudentDashboardActivities(
        currentStudentId,
        (incomingActivity) => {
          setActivities((prev) => {
            const deduped = prev.filter((item) => item.id !== incomingActivity.id);
            return [incomingActivity, ...deduped].slice(0, 5);
          });
        }
      );
    };

    startRealtimeActivities().catch(() => {
      // Feed remains on existing polling fallback when socket setup fails.
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  // Fetch results when resultsLimit is set or changes
  useEffect(() => {
    if (resultsLimit > 0) {
      fetchRecentResults();
    }
  }, [resultsLimit]);

  const fetchCarouselImages = async () => {
    try {
      const images = await getCarouselImages();
      if (images.length > 0) {
        setCarouselImages(images);
      } else {
        // Fallback to default images if none in Firestore
        setCarouselImages([
          {
            id: "1",
            uri: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80",
            title: "Welcome to Our School",
            subtitle: "Excellence in Education",
            order: 1
          },
          {
            id: "2",
            uri: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=80",
            title: "Campus Life",
            subtitle: "Building Future Leaders",
            order: 2
          },
          {
            id: "3",
            uri: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1200&q=80",
            title: "Learning Environment",
            subtitle: "Inspiring Young Minds",
            order: 3
          },
        ]);
      }
    } catch (error) {
      console.warn("Failed to load carousel images");
      setCarouselImages([
        {
          id: "1",
          uri: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80",
          title: "Welcome to Our School",
          subtitle: "Excellence in Education",
          order: 1
        },
        {
          id: "2",
          uri: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=80",
          title: "Campus Life",
          subtitle: "Building Future Leaders",
          order: 2
        },
        {
          id: "3",
          uri: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1200&q=80",
          title: "Learning Environment",
          subtitle: "Inspiring Young Minds",
          order: 3
        },
      ]);
    }
  };

  const fetchStudentInfo = async () => {
    try {
      setStudentInfoLoading(true);
      const currentStudentId = await resolveStudentId();

      if (!currentStudentId) {
        // Use stored name at minimum
        const name = await AsyncStorage.getItem("userName");
        if (name) setStudentInfo((prev) => ({ ...prev, name }));
        return;
      }

      const info = await getStudentInfo(currentStudentId);
      setStudentInfo(info);
    } catch (error) {
      console.warn("Failed to load student info", error);
      // Show stored name as fallback
      const name = await AsyncStorage.getItem("userName");
      if (name) setStudentInfo((prev) => ({ ...prev, name }));
    } finally {
      setStudentInfoLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const config = await getAppConfig();
      setResultsLimit(config.resultsDisplayCount);
    } catch (error) {
      console.warn("Failed to load config");
      setResultsLimit(3);
    }
  };

  const fetchEvents = async () => {
    try {
      const eventsList = await getActiveEvents(5);
      setEvents(eventsList);
    } catch (error) {
      console.warn("Failed to load events");
      setEvents([]);
    }
  };

  const fetchActivities = async () => {
    try {
      const currentStudentId = await resolveStudentId();
      if (!currentStudentId) return;
      const activitiesList = await getStudentDashboardActivities(currentStudentId, 5);
      setActivities(activitiesList);
    } catch (error) {
      console.warn("Failed to load activities");
      setActivities([]);
    }
  };

  const fetchRecentResults = async () => {
    try {
      const currentStudentId = await resolveStudentId();
      if (!currentStudentId) return;
      const results = await getRecentResults(currentStudentId, resultsLimit);
      setRecentResults(results);
    } catch (error) {
      console.warn("Failed to load results");
      setRecentResults([]);
    }
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "#10B981";
    if (grade.startsWith("B")) return "#3B82F6";
    if (grade.startsWith("C")) return "#F59E0B";
    if (grade.startsWith("D")) return "#EF4444";
    return "#6B7280";
  };

  const getAttendanceIcon = (status: string) => {
    const s = (status || "").trim();
    if (s === "Present") return { name: "check-circle", color: "#10B981", bgColor: "rgba(16, 185, 129, 0.10)" };
    if (s === "Absent") return { name: "cancel", color: "#EF4444", bgColor: "rgba(239, 68, 68, 0.10)" };
    if (s === "Late") return { name: "access-time", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.10)" };
    if (s === "Excused") return { name: "info", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.10)" };
    return { name: "help-outline", color: "#94A3B8", bgColor: "rgba(148, 163, 184, 0.10)" }; // Not Marked
  };

  const fetchAssignmentStats = async () => {
    try {
      const classId = await AsyncStorage.getItem("classId") ?? "";
      if (!classId) return;
      const stats = await getAssignmentStats(classId);
      setAssignmentStats(stats);
    } catch (error) {
      console.warn("Failed to load assignment stats");
      setAssignmentStats({ pending: 0, submitted: 0 });
    }
  };

  const fetchAttendanceData = async () => {
    try {
      const currentStudentId = await resolveStudentId();
      if (!currentStudentId) return;
      const attendance = await getTodayAttendance(currentStudentId);
      setAttendanceData(attendance);
    } catch (error) {
      console.warn("Failed to load attendance");
      setAttendanceData({ todayFN: "Not Marked", todayAN: "Not Marked", monthlyPercentage: 0 });
    }
  };

  const fetchUnreadNotificationCount = async () => {
    try {
      const data = await apiFetch<{ unreadCount: number }>("/notifications/unread-count");
      setUnreadNotificationCount(data.unreadCount ?? 0);
    } catch {
      setUnreadNotificationCount(0);
    }
  };

  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {/* STUDENT INFO CARD - PREMIUM DESIGN */}
          <View style={styles.headerContainer}>
            <Card style={styles.headerCard}>
              {/* Gradient Background Layer */}
              <LinearGradient
                colors={["#4C6EF5", "#6B8AFF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerGradient}
              />
              
              {/* Content Layer */}
              <View style={styles.headerContent}>
                {/* Left: Avatar and Info */}
                <Pressable 
                  onPress={() => router.push('/student/profile' as any)}
                  style={styles.profileSection}
                >
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatarCircle}>
                      {studentInfo.photoURL ? (
                        <ExpoImage
                          source={{ uri: studentInfo.photoURL }}
                          style={{ width: 36, height: 36, borderRadius: 18 }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={120}
                        />
                      ) : (
                        <MaterialCommunityIcons name="account" size={36} color="#4C6EF5" />
                      )}
                    </View>
                    <View style={styles.statusBadge}>
                      <View style={styles.statusDot} />
                    </View>
                  </View>
                  
                  <View style={styles.profileInfo}>
                    <Text style={styles.studentName}>{studentInfoLoading ? "Loading..." : studentInfo.name}</Text>
                    <View style={styles.studentMetaRow}>
                      <View style={styles.admissionBadge}>
                        <MaterialIcons name="badge" size={12} color="#94A3B8" />
                        <Text style={styles.admissionNumber}>{studentInfo.admissionNumber}</Text>
                      </View>
                    </View>
                    <View style={styles.studentClassRow}>
                      <MaterialIcons name="school" size={12} color="#94A3B8" />
                      <Text style={styles.studentClass}>{studentInfo.class}{studentInfo.section ? ` • ${studentInfo.section}` : ""}</Text>
                    </View>
                  </View>
                </Pressable>

                {/* Right: Notifications + Logout */}
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.notificationButton}
                    onPress={() => router.push('/student/notifications' as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.notificationCircle}>
                      <MaterialCommunityIcons name="bell-outline" size={20} color="#4C6EF5" />
                      {unreadNotificationCount > 0 && (
                        <View style={styles.notificationBadge}>
                          <Text style={styles.notificationBadgeText}>
                            {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.logoutButton}
                    onPress={handleLogout}
                    activeOpacity={0.7}
                  >
                    <View style={styles.logoutCircle}>
                      <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </Card>
          </View>

          {/* SCHOOL IMAGES CAROUSEL */}
          {carouselImages.length > 0 && (
            <View style={styles.carouselContainer}>
              <ScrollView
                ref={carouselScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const slideIndex = Math.round(
                    e.nativeEvent.contentOffset.x / carouselWidth
                  );
                  setCurrentSlide(slideIndex);
                }}
                scrollEventThrottle={16}
                decelerationRate="fast"
                snapToInterval={carouselWidth}
                snapToAlignment="center"
              >
                {carouselImages.map((item) => (
                  <View key={item.id} style={[styles.carouselSlide, { width: carouselWidth }]}>
                    <View style={styles.carouselImageContainer}>
                      <ExpoImage
                        source={{ uri: item.uri }}
                        style={styles.carouselImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={180}
                      />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.75)"]}
                        style={styles.carouselOverlay}
                      >
                        <View style={styles.carouselTextContainer}>
                          <Text style={styles.carouselTitle}>{item.title}</Text>
                          <Text style={styles.carouselSubtitle}>{item.subtitle}</Text>
                        </View>
                      </LinearGradient>
                    </View>
                  </View>
                ))}
              </ScrollView>
              
              {/* Carousel Indicators */}
              <View style={styles.carouselIndicators}>
                {carouselImages.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.indicator,
                      currentSlide === index && styles.indicatorActive,
                    ]}
                  />
                ))}
              </View>
            </View>
          )}

          {/* ATTENDANCE SUMMARY CARD */}
          <Card style={styles.attendanceSummaryCard}>
            <View style={styles.attendanceHeader}>
              <Text style={styles.attendanceTitle}>Today&apos;s Attendance</Text>
              <TouchableOpacity onPress={() => router.push('/student/attendance' as any)}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.attendanceContent}>
              {/* Forenoon */}
              <View style={styles.attendanceItem}>
                <View style={[styles.attendanceIconCircle, { backgroundColor: getAttendanceIcon(attendanceData.todayFN).bgColor }]}>
                  <MaterialIcons
                    name={getAttendanceIcon(attendanceData.todayFN).name as any}
                    size={22}
                    color={getAttendanceIcon(attendanceData.todayFN).color}
                  />
                </View>
                <View style={styles.attendanceInfo}>
                  <Text style={styles.attendanceLabel}>Forenoon</Text>
                  <Text style={[styles.attendanceStatus, { color: getAttendanceIcon(attendanceData.todayFN).color }]}>
                    {attendanceData.todayFN}
                  </Text>
                </View>
              </View>

              <View style={styles.attendanceDivider} />

              {/* Afternoon */}
              <View style={styles.attendanceItem}>
                <View style={[styles.attendanceIconCircle, { backgroundColor: getAttendanceIcon(attendanceData.todayAN).bgColor }]}>
                  <MaterialIcons
                    name={getAttendanceIcon(attendanceData.todayAN).name as any}
                    size={22}
                    color={getAttendanceIcon(attendanceData.todayAN).color}
                  />
                </View>
                <View style={styles.attendanceInfo}>
                  <Text style={styles.attendanceLabel}>Afternoon</Text>
                  <Text style={[styles.attendanceStatus, { color: getAttendanceIcon(attendanceData.todayAN).color }]}>
                    {attendanceData.todayAN}
                  </Text>
                </View>
              </View>

              <View style={styles.attendanceDivider} />

              {/* Monthly Percentage */}
              <View style={styles.attendanceItem}>
                <View style={[styles.attendanceIconCircle, { backgroundColor: "rgba(76, 110, 245, 0.10)" }]}>
                  <MaterialIcons name="assessment" size={22} color="#4C6EF5" />
                </View>
                <View style={styles.attendanceInfo}>
                  <Text style={styles.attendanceLabel}>Monthly</Text>
                  <Text style={styles.attendancePercentage}>{attendanceData.monthlyPercentage}%</Text>
                </View>
              </View>
            </View>
          </Card>

          {/* QUICK ACCESS SECTION - 2 ROWS LAYOUT */}
          <View style={styles.quickAccessBlock}>
            <Section title="Quick Access">
              <Card style={styles.quickAccessCardContainer}>
                <View style={styles.quickAccessGrid}>
                {/* Row 1 */}
                <QuickAccessTile
                  label="Assignments"
                  badge={assignmentStats.pending > 0 ? `${assignmentStats.pending} Pending` : "View"}
                  route="/student/assignments"
                  iconName="file-document-outline"
                />
                <QuickAccessTile
                  label="Timetable"
                  badge="Today"
                  route="/student/timetable"
                  iconName="calendar-clock"
                />
                <QuickAccessTile
                  label="Results"
                  badge="View All"
                  route="/student/results"
                  iconName="chart-line"
                />
                <QuickAccessTile
                  label="Library"
                  badge="Browse"
                  route="/student/library"
                  iconName="library-shelves"
                />
                <QuickAccessTile
                  label="Fees"
                  badge="View"
                  route="/student/fees"
                  iconName="credit-card-outline"
                />
                <QuickAccessTile
                  label="Questions"
                  badge="Practice"
                  route="/student/question-bank"
                  iconName="head-question-outline"
                />
              </View>
              </Card>
            </Section>
          </View>

        {/* RECENT RESULTS SECTION - ENHANCED */}
        {recentResults.length > 0 && (
          <View style={styles.recentResultsBlock}>
            <Section title="Recent Results" onSeeAll={() => router.push('/student/results' as any)}>
              <Card style={styles.resultsCard}>
                {recentResults.map((result, index) => (
                  <TouchableOpacity
                    key={result.id}
                    onPress={() => router.push('/student/results' as any)}
                    style={[
                      styles.resultItem,
                      index < recentResults.length - 1 && styles.resultItemBorder
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={styles.resultLeft}>
                      <View style={styles.resultIconCircle}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#4C6EF5" />
                      </View>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultSubject}>{result.subject}</Text>
                        <View style={styles.resultMetaRow}>
                          <MaterialCommunityIcons name="chart-box-outline" size={14} color="#10B981" />
                          <View style={styles.resultMarksContainer}>
                            <Text style={styles.resultMarksText}>
                              {result.marks}/{result.total} marks
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.resultGradeBadge, { backgroundColor: getGradeColor(result.grade) }]}>
                      <Text style={styles.resultGradeText}>{result.grade}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </Card>
            </Section>
          </View>
        )}

          {/* EVENTS & NEWS SECTION - ENHANCED */}
          {events.length > 0 && (
            <View style={styles.eventsBlock}>
              <Section title="Events & News" onSeeAll={() => {}}>
                <Card style={styles.eventsCard}>
                  {events.map((event, index) => (
                    <TouchableOpacity
                      key={event.id}
                      onPress={() => {}}
                      style={[
                        styles.eventItem,
                        index < events.length - 1 && styles.eventItemBorder
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.eventRow}>
                        <View
                          style={[
                            styles.eventIconCircle,
                            { backgroundColor: `${event.color}15` }
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={event.icon as any}
                            size={26}
                            color={event.color || "#4C6EF5"}
                          />
                        </View>
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle}>{event.title}</Text>
                          <View style={styles.eventDateRow}>
                            <MaterialCommunityIcons
                              name="calendar-outline"
                              size={14}
                              color="#4C6EF5"
                            />
                            <View style={styles.eventDateContainer}>
                              <Text style={styles.eventDate}>{event.date}</Text>
                            </View>
                          </View>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={20}
                          color="#CBD5E1"
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                </Card>
              </Section>
            </View>
          )}

          {/* ACTIVITY SECTION - ENHANCED */}
          {activities.length > 0 && (
            <View style={styles.activityBlock}>
              <Section title="Recent Activity" onSeeAll={() => {}}>
                <Card style={styles.activitiesCard}>
                  {activities.map((activity, index) => (
                    <TouchableOpacity
                      key={activity.id}
                      onPress={() => {}}
                      style={[
                        styles.activityItem,
                        index < activities.length - 1 && styles.activityItemBorder
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.activityRow}>
                        <View
                          style={[
                            styles.activityIconCircle,
                            { backgroundColor: `${activity.color}15` }
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={activity.icon as any}
                            size={22}
                            color={activity.color}
                          />
                        </View>
                        <View style={styles.activityInfo}>
                          <Text style={styles.activityTitle}>{activity.title}</Text>
                          <View style={styles.activityTimeContainer}>
                            <MaterialCommunityIcons
                              name="clock-outline"
                              size={12}
                              color="#94A3B8"
                            />
                            <Text style={styles.activityTime}>{activity.time}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </Card>
              </Section>
            </View>
          )}

        </ScrollView>
      </View>

      {/* PREMIUM FLOATING BOTTOM NAVIGATION */}
      <SafeAreaView edges={["bottom"]} style={styles.floatingNavContainer}>
        <View style={styles.floatingNav}>
          {/* Home (active) */}
          <Pressable style={styles.navItemActive} onPress={() => {}}>
            {({ pressed }) => (
              <View style={[styles.activeNavFilled, { opacity: pressed ? 0.6 : 1 }]}> 
                <MaterialCommunityIcons name="home" size={24} color="#FFFFFF" />
                <Text style={styles.navLabelActive}>Home</Text>
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
          {/* Account (inactive) */}
          <Pressable style={styles.navItem} onPress={() => router.push('/student/profile' as any)}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.6 : 1 }}>
                <MaterialCommunityIcons name="account-outline" size={24} color="#D1D5DB" />
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
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 80,
  },
  
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 32,
  },
  // STUDENT INFO CARD - PREMIUM STYLES
  headerContainer: {
    marginBottom: 16,
  },
  headerCard: {
    borderRadius: 24,
    padding: 0,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  headerGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%",
    opacity: 0.08,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 16,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#F0F4FF",
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10B981",
  },
  profileInfo: {
    flex: 1,
    gap: 6,
  },
  studentName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    letterSpacing: -0.3,
  },
  studentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  admissionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  admissionNumber: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    letterSpacing: 0.2,
  },
  studentClassRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  studentClass: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoutButton: {
    padding: 4,
  },
  logoutCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FEE2E2",
  },

  // SCHOOL IMAGES CAROUSEL STYLES
  carouselContainer: {
    marginBottom: 48,
    marginTop: 12,
  },
  carouselSlide: {
    paddingHorizontal: 0,
  },
  carouselImageContainer: {
    height: 200,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  carouselImage: {
    width: "100%",
    height: "100%",
  },
  dashboardErrorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  dashboardErrorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 10,
  },
  dashboardErrorMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 18,
  },
  dashboardErrorRetry: {
    backgroundColor: "#4C6EF5",
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  dashboardErrorRetryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  carouselOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    justifyContent: "flex-end",
    padding: 20,
  },
  carouselTextContainer: {
    gap: 4,
  },
  carouselTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  carouselSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#E2E8F0",
    letterSpacing: 0.2,
  },
  carouselIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#CBD5E1",
  },
  indicatorActive: {
    width: 24,
    backgroundColor: "#4C6EF5",
  },
  
  notificationButton: {
    padding: 4,
  },
  notificationCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F8F9FA",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  notificationBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  
  // PRIMARY HERO WELCOME CARD
  welcomeCard: {
    backgroundColor: "#4A64D6",
    borderRadius: 28,
    minHeight: 140,
    elevation: 8,
    shadowColor: "#5874E8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    marginBottom: 16,
    marginTop: 12,
    overflow: "hidden",
  },
  welcomeGradient: {
    borderRadius: 28,
    paddingTop: 2,
    backgroundColor: "#5874E8",
  },
  welcomeHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  welcomeContent: {
    justifyContent: "center",
    paddingTop: 30,
    paddingBottom: 26,
    paddingHorizontal: 4,
  },
  welcomeMicroText: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 12,
    letterSpacing: 0.5,
    lineHeight: 40,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#C8D4FF",
    lineHeight: 24,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  
  // QUICK ACCESS SECTION - CLEAN 2 ROWS LAYOUT
  quickAccessBlock: {
    marginBottom: 32,
  },
  
  quickAccessCardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  
  quickAccessGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  
  quickAccessCard: {
    width: "31.5%",
    borderRadius: 16,
    padding: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  
  quickAccessIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  
  quickAccessLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 4,
  },
  
  quickAccessBadgeText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
  },
  
  // SECTION SPACING
  sectionSpacer: {
    height: 8,
  },
  
  favoriteItem: {
    width: "31%",
    alignItems: "center",
    marginBottom: 8,
  },
  favoriteItemInner: {
    alignItems: "center",
  },
  favoriteIconWrapper: {
    marginBottom: 10,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  favoriteLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
    textAlign: "center",
    lineHeight: 16,
    marginBottom: 3,
  },
  favoriteBadge: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
    marginTop: 0,
    marginBottom: 2,
    lineHeight: 13,
  },
  
  // EVENTS SECTION - ENHANCED
  eventsBlock: {
    marginBottom: 16,
  },
  eventsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  eventItem: {
    paddingVertical: 12,
  },
  eventItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 6,
  },
  eventDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventDateContainer: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  eventDate: {
    fontSize: 12,
    color: "#4C6EF5",
    fontWeight: "600",
  },
  
  // ACTIVITY SECTION - ENHANCED
  activityBlock: {
    marginBottom: 16,
  },
  activitiesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  activityItem: {
    paddingVertical: 12,
  },
  activityItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  activityIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  activityTimeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  activityTime: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },
  
  // OLD ACTIVITY CARD - REFINED (LEGACY)
  lowActivityCard: {
    borderRadius: 14,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 4,
    backgroundColor: "#FAFBFD",
    marginBottom: 16,
  },
  activityContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  activityMessage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C6EF5",
  },

  // ATTENDANCE SUMMARY CARD STYLES
  attendanceSummaryCard: {
    marginBottom: 32,
    elevation: 5,
  },
  attendanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  attendanceTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  attendanceContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attendanceItem: {
    flex: 1,
    alignItems: "center",
  },
  attendanceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(76, 110, 245, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  attendanceInfo: {
    alignItems: "center",
  },
  attendanceLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 4,
    textAlign: "center",
  },
  attendanceStatus: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  attendancePercentage: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
    textAlign: "center",
  },
  attendanceDivider: {
    width: 1,
    height: 50,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 12,
  },

  // RECENT RESULTS STYLES
  recentResultsBlock: {
    marginBottom: 16,
  },
  resultsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  resultItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  resultLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  resultIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(76, 110, 245, 0.10)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultSubject: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  resultMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  resultMarksContainer: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  resultMarksText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
  },
  resultMarks: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  resultGradeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 50,
    alignItems: "center",
  },
  resultGradeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ASSIGNMENT STATISTICS STYLES
  assignmentStatsContainer: {
    gap: 16,
  },
  assignmentStatsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  assignmentStatsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  assignmentStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
  },
  assignmentStatItem: {
    alignItems: "center",
    gap: 8,
  },
  assignmentStatBadge: {
    backgroundColor: "rgba(245, 158, 11, 0.10)",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  assignmentStatBadgeSubmitted: {
    backgroundColor: "rgba(16, 185, 129, 0.10)",
  },
  assignmentStatNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  assignmentStatLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  assignmentStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E7EB",
  },
  
  bottomSpacer: {
    height: 100,
  },
  
  // PREMIUM FLOATING BOTTOM NAVIGATION
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
  navLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 4,
  },
});
