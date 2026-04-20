import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Image,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import Section from "../../components/Section";
import { auth } from "../../firebase";
import { getCarouselItems } from "../../services/carouselService";
import { getEvents } from "../../services/eventsService";
import { clearSessionAccessToken } from "../../services/api";
import { getSchedules } from "../../services/scheduleService";
import { getTeacherActivities, getTeacherPendingTasks, getTeacherProfile } from "../../services/teacherService";

interface TodayClass {
  id: string;
  subject: string;
  class: string;
  time: string;
  room: string;
  status: "upcoming" | "ongoing" | "completed";
}

interface PendingTask {
  id: string;
  type: "assignment" | "attendance" | "marks";
  title: string;
  class: string;
  dueDate: string;
  count?: number;
}

interface Event {
  id: string;
  title: string;
  date: string;
  icon: string;
  color: string;
}

interface Activity {
  id: string;
  type: string;
  title: string;
  time: string;
  icon: string;
  color: string;
}

export default function TeacherDashboard() {
  const [refreshing, setRefreshing] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const carouselScrollRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get("window").width;
  const carouselWidth = screenWidth - 40;

  const [teacherInfo, setTeacherInfo] = useState({
    name: "",
    employeeId: "",
    department: "",
    designation: "",
  });

  const [todayStats, setTodayStats] = useState({
    classesToday: 0,
    classesCompleted: 0,
    totalStudents: 0,
  });

  const [carouselImages, setCarouselImages] = useState<any[]>([]);
  
  const [todayClasses, setTodayClasses] = useState<TodayClass[]>([]);
  
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  
  const [events, setEvents] = useState<Event[]>([]);
  
  const [activities, setActivities] = useState<Activity[]>([]);

  const quickActions = [
    { icon: "calendar-check", label: "Attendance", badge: "Mark Now", color: "#4C6EF5", route: "/teacher/attendance" },
    { icon: "file-document-edit", label: "Assignments", badge: `${pendingTasks.filter(t => t.type === "assignment").length} Pending`, color: "#4C6EF5", route: "/teacher/assignments" },
    { icon: "chart-line", label: "Results", badge: "View All", color: "#4C6EF5", route: "/teacher/results" },
    { icon: "help-circle", label: "Questions", badge: "Add New", color: "#4C6EF5", route: "/teacher/add-question" },
    { icon: "calendar-clock", label: "Schedule", badge: "Manage", color: "#4C6EF5", route: "/teacher/schedule" },
  ];

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      if (isMounted) {
        await loadAllData();
      }
    };
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const loadAllData = async () => {
    try {
      setError(null);
      // Read teacherId once for all fetches
      const teacherId = (await AsyncStorage.getItem("teacherId")) || (await AsyncStorage.getItem("userId"));
      if (!teacherId) { router.replace("/login" as any); return; }

      // Critical data first — show UI immediately
      const [, classes] = await Promise.all([
        fetchTeacherInfo(teacherId),
        fetchTodayClasses(teacherId),
      ]);
      // classes returned from fetchTodayClasses so we can compute stats immediately

      // Non-critical data — load in background, don't block render
      Promise.all([
        fetchCarouselImages(),
        fetchPendingTasks(teacherId),
        fetchEvents(),
        fetchActivities(teacherId),
      ]).catch(() => {});
    } catch (error: any) {
      console.warn("Error loading dashboard data:", error?.message || error);
      setError("Some features may be unavailable due to permissions");
    }
  };

  const fetchTeacherInfo = async (id?: string) => {
    try {
      const teacherId = id || (await AsyncStorage.getItem("teacherId")) || (await AsyncStorage.getItem("userId"));
      const storedName = await AsyncStorage.getItem("userName");
      if (!teacherId) { router.replace("/login" as any); return; }
      const data = await getTeacherProfile(teacherId);
      setTeacherInfo({
        name: data.name || `${(data as any).firstName ?? ""} ${(data as any).lastName ?? ""}`.trim() || storedName || "",
        employeeId: data.employeeId || "",
        department: data.department || "",
        designation: data.designation || "",
      });
      // Update total students if available
      if (data.totalStudents) {
        setTodayStats(prev => ({ ...prev, totalStudents: data.totalStudents || 0 }));
      }
    } catch (err) {
      console.warn("Error fetching teacher info:", err);
      // Fall back to stored name from login
      const storedName = await AsyncStorage.getItem("userName");
      if (storedName) {
        setTeacherInfo(prev => ({ ...prev, name: storedName }));
      }
    }
  };

  const fetchCarouselImages = async () => {
    try {
      const images = await getCarouselItems();
      if (images.length > 0) {
        setCarouselImages(images);
      }
    } catch (err) {
      console.warn("Error fetching carousel:", err);
      // Using default carousel images set in initial state
    }
  };

  const fetchTodayClasses = async (id?: string): Promise<TodayClass[]> => {
    try {
      const teacherId = id || await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId");
      if (!teacherId) return [];
      const today = new Date();
      const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today.getDay()];
      
      const schedules = await getSchedules({ teacherId, day: dayOfWeek });
      
      const currentHour = today.getHours();
      const currentMinute = today.getMinutes();
      
      const classes: TodayClass[] = schedules.map((data) => {
        const startHour = parseInt(data.startTime?.split(":")[0] || "0");
        const endHour = parseInt(data.endTime?.split(":")[0] || "0");
        
        let status: "upcoming" | "ongoing" | "completed" = "upcoming";
        if (currentHour > endHour || (currentHour === endHour && currentMinute > 0)) {
          status = "completed";
        } else if (currentHour >= startHour && currentHour < endHour) {
          status = "ongoing";
        }
        
        return {
          id: data.id,
          subject: data.subject || "Unknown Subject",
          class: data.class || "Unknown",
          time: `${data.startTime || "08:00"} - ${data.endTime || "09:00"}`,
          room: data.room || "",
          status,
        };
      });
      
      const sorted = classes.sort((a, b) => a.time.localeCompare(b.time));
      setTodayClasses(sorted);
      
      // Update stats immediately with fresh data
      const completed = sorted.filter(c => c.status === "completed").length;
      setTodayStats(prev => ({
        ...prev,
        classesToday: sorted.length,
        classesCompleted: completed,
      }));
      
      return sorted;
    } catch (err) {
      console.warn("Error fetching timetable:", err);
      return [];
    }
  };

  const fetchPendingTasks = async (id?: string) => {
    try {
      const teacherId = id || await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId");
      if (!teacherId) return;
      const tasks = await getTeacherPendingTasks({ teacherId, status: "pending", limit: 5 });
      setPendingTasks(tasks);
    } catch (err) {
      console.warn("Error fetching tasks:", err);
    }
  };

  const fetchEvents = async () => {
    try {
      const eventsList = await getEvents({ isActive: true, limit: 5 });
      if (eventsList.length > 0) {
        setEvents(eventsList.map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
          icon: e.icon || "calendar",
          color: e.color || "#4C6EF5",
        })));
      }
    } catch (err) {
      console.warn("Error fetching events:", err);
    }
  };

  const fetchActivities = async (id?: string) => {
    try {
      const teacherId = id || await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId");
      if (!teacherId) return;
      const list = await getTeacherActivities({ teacherId, limit: 5 });
      if (list.length > 0) {
        setActivities(list);
      }
    } catch (err) {
      console.warn("Error fetching activities:", err);
    }
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "#10B981";
      case "ongoing": return "#4C6EF5";
      case "upcoming": return "#F59E0B";
      default: return "#6B7280";
    }
  };

  const getStatusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

  const getStatusIcon = (status: string) => {
    if (status === "completed") return { name: "check-circle", color: "#10B981", bgColor: "rgba(16, 185, 129, 0.10)" };
    if (status === "ongoing") return { name: "clock-outline", color: "#4C6EF5", bgColor: "rgba(76, 110, 245, 0.10)" };
    return { name: "clock-alert-outline", color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.10)" };
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case "assignment": return "file-document-edit";
      case "attendance": return "calendar-check";
      case "marks": return "clipboard-text";
      default: return "alert-circle";
    }
  };

  const getTaskColor = (type: string) => {
    switch (type) {
      case "assignment": return "#10B981";
      case "attendance": return "#4C6EF5";
      case "marks": return "#F59E0B";
      default: return "#6B7280";
    }
  };

  return (
    <SafeAreaView style={styles.wrapper}>
      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* TEACHER INFO CARD - PREMIUM DESIGN */}
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
                  onPress={() => router.push('/teacher/profile' as any)}
                  style={styles.profileSection}
                >
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatarCircle}>
                      <MaterialCommunityIcons name="account" size={36} color="#4C6EF5" />
                    </View>
                    <View style={styles.statusBadge}>
                      <View style={styles.statusDot} />
                    </View>
                  </View>
                  
                  <View style={styles.profileInfo}>
                    <Text style={styles.teacherName}>{teacherInfo.name}</Text>
                    <View style={styles.teacherMetaRow}>
                      <View style={styles.employeeBadge}>
                        <MaterialIcons name="badge" size={12} color="#94A3B8" />
                        <Text style={styles.employeeId}>{teacherInfo.employeeId}</Text>
                      </View>
                    </View>
                    <View style={styles.teacherDeptRow}>
                      <MaterialIcons name="school" size={12} color="#94A3B8" />
                      <Text style={styles.teacherDept}>{teacherInfo.department} • {teacherInfo.designation}</Text>
                    </View>
                  </View>
                </Pressable>

                {/* Right: Logout Button */}
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
            </Card>
          </View>

          {/* CAROUSEL */}
          {carouselImages.length > 0 && (
            <View style={styles.carouselContainer}>
              <ScrollView
                ref={carouselScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const slideIndex = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
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
                      <Image source={{ uri: item.uri }} style={styles.carouselImage} resizeMode="cover" />
                      <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.carouselOverlay}>
                        <View style={styles.carouselTextContainer}>
                          <Text style={styles.carouselTitle}>{item.title}</Text>
                          <Text style={styles.carouselSubtitle}>{item.subtitle}</Text>
                        </View>
                      </LinearGradient>
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.carouselIndicators}>
                {carouselImages.map((_, index) => (
                  <View key={index} style={[styles.indicator, currentSlide === index && styles.indicatorActive]} />
                ))}
              </View>
            </View>
          )}

          {/* TODAY'S SUMMARY - SINGLE ROW PREMIUM CARD */}
          <View style={styles.summaryContainer}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <View style={styles.sectionIconCircle}>
                  <MaterialCommunityIcons name="chart-box" size={20} color="#4C6EF5" />
                </View>
                <Text style={styles.sectionHeaderTitle}>Today&apos;s Summary</Text>
              </View>
              <TouchableOpacity 
                onPress={() => router.push("/teacher/menu" as any)}
                style={styles.viewAllButton}
                activeOpacity={0.7}
              >
                <Text style={styles.viewAllText}>View All</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#4C6EF5" />
              </TouchableOpacity>
            </View>

            <Card style={styles.summaryCard}>
              <View style={styles.summaryContent}>
                {/* Classes Today */}
                <TouchableOpacity
                  style={styles.summaryItem}
                  onPress={() => router.push("/teacher/menu" as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.summaryIconCircle, { backgroundColor: "rgba(76, 110, 245, 0.12)" }]}>
                    <MaterialCommunityIcons name="calendar-today" size={28} color="#4C6EF5" />
                  </View>
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryValue}>{todayStats.classesToday}</Text>
                    <Text style={styles.summaryLabel}>Classes</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.summaryDivider} />

                {/* Completed */}
                <TouchableOpacity
                  style={styles.summaryItem}
                  onPress={() => router.push("/teacher/attendance" as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.summaryIconCircle, { backgroundColor: "rgba(16, 185, 129, 0.12)" }]}>
                    <MaterialCommunityIcons name="check-circle" size={28} color="#10B981" />
                  </View>
                  <View style={styles.summaryInfo}>
                    <Text style={[styles.summaryValue, { color: "#10B981" }]}>{todayStats.classesCompleted}</Text>
                    <Text style={styles.summaryLabel}>Completed</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.summaryDivider} />

                {/* Total Students */}
                <TouchableOpacity
                  style={styles.summaryItem}
                  onPress={() => router.push("/teacher/attendance" as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.summaryIconCircle, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
                    <MaterialCommunityIcons name="account-group" size={28} color="#F59E0B" />
                  </View>
                  <View style={styles.summaryInfo}>
                    <Text style={styles.summaryValue}>{todayStats.totalStudents}</Text>
                    <Text style={styles.summaryLabel}>Students</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Card>
          </View>

          {/* QUICK ACCESS */}
          <View style={styles.quickAccessBlock}>
            <Section title="Quick Access">
              <Card style={styles.quickAccessCardContainer}>
                <View style={styles.quickAccessGrid}>
                  {quickActions.map((action, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={[styles.quickAccessCard, { backgroundColor: "#EEF2FF" }]} 
                      onPress={() => router.push(action.route as any)} 
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickAccessIconWrapper, { backgroundColor: action.color }]}>
                        <MaterialCommunityIcons name={action.icon as any} size={26} color="#FFFFFF" />
                      </View>
                      <Text style={styles.quickAccessLabel}>{action.label}</Text>
                      <Text style={styles.quickAccessBadgeText}>{action.badge}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Card>
            </Section>
          </View>

          {/* TODAY'S SCHEDULE - PREMIUM CARD */}
          <View style={styles.scheduleBlock}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderLeft}>
                <View style={styles.sectionIconCircle}>
                  <MaterialCommunityIcons name="calendar-clock" size={20} color="#4C6EF5" />
                </View>
                <Text style={styles.sectionHeaderTitle}>Today&apos;s Schedule</Text>
              </View>
              <TouchableOpacity 
                onPress={() => router.push("/teacher/schedule" as any)}
                style={styles.viewAllButton}
                activeOpacity={0.7}
              >
                <Text style={styles.viewAllText}>See All</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#4C6EF5" />
              </TouchableOpacity>
            </View>
            {todayClasses.length > 0 ? (
            <Card style={styles.scheduleCard}>
                {todayClasses.slice(0, 3).map((classItem, index) => (
                  <TouchableOpacity 
                    key={classItem.id} 
                    style={[styles.scheduleItem, index < Math.min(todayClasses.length, 3) - 1 && styles.scheduleItemBorder]} 
                    activeOpacity={0.7}
                    onPress={() => router.push("/teacher/schedule" as any)}
                  >
                    <View style={styles.scheduleRow}>
                      <View style={[styles.scheduleIconCircle, { backgroundColor: getStatusIcon(classItem.status).bgColor }]}>
                        <MaterialCommunityIcons name={getStatusIcon(classItem.status).name as any} size={24} color={getStatusIcon(classItem.status).color} />
                      </View>
                      <View style={styles.scheduleInfo}>
                        <Text style={styles.scheduleSubject}>{classItem.subject}</Text>
                        <View style={styles.scheduleMetaRow}>
                          <View style={styles.scheduleMetaItem}>
                            <MaterialCommunityIcons name="account-group" size={14} color="#64748B" />
                            <Text style={styles.scheduleClass}>{classItem.class}</Text>
                          </View>
                          <Text style={styles.scheduleMetaDot}>•</Text>
                          <View style={styles.scheduleMetaItem}>
                            <MaterialCommunityIcons name="clock-outline" size={14} color="#64748B" />
                            <Text style={styles.scheduleTime}>{classItem.time}</Text>
                          </View>
                        </View>
                        <View style={styles.scheduleRoomRow}>
                          <MaterialCommunityIcons name="door" size={14} color="#94A3B8" />
                          <Text style={styles.scheduleRoom}>{classItem.room}</Text>
                        </View>
                      </View>
                      <View style={[styles.scheduleStatusBadge, { backgroundColor: getStatusColor(classItem.status) + "15" }]}>
                        <View style={[styles.statusDotBadge, { backgroundColor: getStatusColor(classItem.status) }]} />
                        <Text style={[styles.scheduleStatusText, { color: getStatusColor(classItem.status) }]}>{getStatusLabel(classItem.status)}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
                {todayClasses.length > 3 && (
                  <TouchableOpacity 
                    style={styles.viewMoreButton}
                    onPress={() => router.push("/teacher/schedule" as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.viewMoreText}>View {todayClasses.length - 3} More Classes</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#4C6EF5" />
                  </TouchableOpacity>
                )}
              </Card>
            ) : (
              <Card style={styles.scheduleCard}>
                <View style={{ alignItems: "center", paddingVertical: 24 }}>
                  <MaterialCommunityIcons name="calendar-blank" size={40} color="#CBD5E1" />
                  <Text style={{ color: "#94A3B8", fontSize: 14, marginTop: 8 }}>No classes scheduled for today</Text>
                </View>
              </Card>
            )}
          </View>

          {/* EVENTS & NEWS */}
          {events.length > 0 && (
            <View style={styles.eventsBlock}>
              <Section title="Events & News" onSeeAll={() => router.push("/teacher/events" as any)}>
                <Card style={styles.eventsCard}>
                  {events.slice(0, 3).map((event, index) => (
                    <TouchableOpacity 
                      key={event.id} 
                      style={[styles.eventItem, index < Math.min(events.length, 3) - 1 && styles.eventItemBorder]} 
                      activeOpacity={0.7}
                      onPress={() => router.push("/teacher/events" as any)}
                    >
                      <View style={styles.eventRow}>
                        <View style={[styles.eventIconCircle, { backgroundColor: `${event.color}15` }]}>
                          <MaterialCommunityIcons name={event.icon as any} size={26} color={event.color} />
                        </View>
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle}>{event.title}</Text>
                          <View style={styles.eventDateRow}>
                            <MaterialCommunityIcons name="calendar-outline" size={14} color="#4C6EF5" />
                            <View style={styles.eventDateContainer}>
                              <Text style={styles.eventDate}>{event.date}</Text>
                            </View>
                          </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                      </View>
                    </TouchableOpacity>
                  ))}
                  {events.length > 3 && (
                    <TouchableOpacity 
                      style={styles.viewMoreEventsButton}
                      onPress={() => router.push("/teacher/events" as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewMoreEventsText}>View {events.length - 3} More Events</Text>
                      <MaterialCommunityIcons name="arrow-right" size={18} color="#4C6EF5" />
                    </TouchableOpacity>
                  )}
                </Card>
              </Section>
            </View>
          )}

          {/* PENDING TASKS */}
          {pendingTasks.length > 0 && (
            <View style={styles.tasksBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <View style={styles.sectionIconCircle}>
                    <MaterialCommunityIcons name="clipboard-list" size={20} color="#4C6EF5" />
                  </View>
                  <Text style={styles.sectionHeaderTitle}>Pending Tasks</Text>
                </View>
              </View>

              <Card style={styles.tasksCard}>
                {pendingTasks.map((task, index) => (
                  <TouchableOpacity 
                    key={task.id} 
                    style={[styles.taskItem, index < pendingTasks.length - 1 && styles.taskItemBorder]}
                    onPress={() => {
                      if (task.type === "assignment") router.push("/teacher/assignments" as any);
                      else if (task.type === "attendance") router.push("/teacher/attendance" as any);
                      else if (task.type === "marks") router.push("/teacher/results" as any);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.taskRow}>
                      <View style={[styles.taskIconCircle, { backgroundColor: getTaskColor(task.type) + "15" }]}>
                        <MaterialCommunityIcons 
                          name={getTaskIcon(task.type) as any} 
                          size={22} 
                          color={getTaskColor(task.type)} 
                        />
                      </View>
                      <View style={styles.taskInfo}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <View style={styles.taskMetaRow}>
                          <MaterialCommunityIcons name="account-group" size={13} color="#64748B" />
                          <Text style={styles.taskClass}>{task.class}</Text>
                          {task.count && (
                            <>
                              <Text style={styles.taskMetaDot}>•</Text>
                              <Text style={styles.taskCount}>{task.count} students</Text>
                            </>
                          )}
                        </View>
                      </View>
                      <View style={styles.taskDueBadge}>
                        <MaterialCommunityIcons name="calendar" size={12} color="#4C6EF5" />
                        <Text style={styles.taskDueText}>{task.dueDate}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </Card>
            </View>
          )}

          {/* RECENT ACTIVITY */}
          {activities.length > 0 && (
            <View style={styles.activityBlock}>
              <Section title="Recent Activity" onSeeAll={() => router.push("/teacher/activity" as any)}>
                <Card style={styles.activitiesCard}>
                  {activities.slice(0, 3).map((activity, index) => (
                    <TouchableOpacity 
                      key={activity.id} 
                      style={[styles.activityItem, index < Math.min(activities.length, 3) - 1 && styles.activityItemBorder]} 
                      activeOpacity={0.7}
                      onPress={() => router.push("/teacher/activity" as any)}
                    >
                      <View style={styles.activityRow}>
                        <View style={[styles.activityIconCircle, { backgroundColor: `${activity.color}15` }]}>
                          <MaterialCommunityIcons name={activity.icon as any} size={22} color={activity.color} />
                        </View>
                        <View style={styles.activityInfo}>
                          <Text style={styles.activityTitle}>{activity.title}</Text>
                          <View style={styles.activityTimeContainer}>
                            <MaterialCommunityIcons name="clock-outline" size={12} color="#94A3B8" />
                            <Text style={styles.activityTime}>{activity.time}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {activities.length > 3 && (
                    <TouchableOpacity 
                      style={styles.viewMoreActivityButton}
                      onPress={() => router.push("/teacher/activity" as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.viewMoreActivityText}>View {activities.length - 3} More Activities</Text>
                      <MaterialCommunityIcons name="arrow-right" size={18} color="#4C6EF5" />
                    </TouchableOpacity>
                  )}
                </Card>
              </Section>
            </View>
          )}
        </ScrollView>
      </View>

      {/* BOTTOM NAV */}
      <SafeAreaView edges={["bottom"]} style={styles.floatingNavContainer}>
        <View style={styles.floatingNav}>
          <Pressable style={styles.navItemActive} onPress={() => {}}>
            {({ pressed }) => (
              <View style={[styles.activeNavFilled, { opacity: pressed ? 0.6 : 1 }]}>
                <MaterialCommunityIcons name="home" size={24} color="#FFFFFF" />
                <Text style={styles.navLabelActive}>Home</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => router.push("/teacher/menu" as any)}>
            {({ pressed }) => (<View style={{ opacity: pressed ? 0.6 : 1 }}><MaterialCommunityIcons name="view-grid-outline" size={24} color="#D1D5DB" /></View>)}
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => router.push("/teacher/profile" as any)}>
            {({ pressed }) => (<View style={{ opacity: pressed ? 0.6 : 1 }}><MaterialCommunityIcons name="account-outline" size={24} color="#D1D5DB" /></View>)}
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#F3F6FB" },
  mainContent: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 80 },
  headerContainer: { marginBottom: 16 },
  headerCard: { borderRadius: 24, padding: 0, overflow: "hidden", elevation: 8, shadowColor: "#4C6EF5", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  headerGradient: { position: "absolute", top: 0, left: 0, right: 0, height: "100%", opacity: 0.08 },
  headerContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  profileSection: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatarContainer: { position: "relative", marginRight: 16 },
  avatarCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#F0F4FF", shadowColor: "#4C6EF5", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  statusBadge: { position: "absolute", bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#10B981" },
  profileInfo: { flex: 1, gap: 6 },
  teacherName: { fontSize: 20, fontWeight: "700", color: "#1E293B", letterSpacing: -0.3 },
  teacherMetaRow: { flexDirection: "row", alignItems: "center" },
  employeeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#F8FAFC", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, gap: 4 },
  employeeId: { fontSize: 12, fontWeight: "600", color: "#64748B", letterSpacing: 0.2 },
  teacherDeptRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  teacherDept: { fontSize: 13, fontWeight: "500", color: "#64748B" },
  logoutButton: { padding: 4 },
  logoutCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FEF2F2", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#FEE2E2" },
  carouselContainer: { marginBottom: 48, marginTop: 12 },
  carouselSlide: { paddingHorizontal: 0 },
  carouselImageContainer: { height: 200, borderRadius: 20, overflow: "hidden", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  carouselImage: { width: "100%", height: "100%" },
  carouselOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, height: "60%", justifyContent: "flex-end", padding: 20 },
  carouselTextContainer: { gap: 4 },
  carouselTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.3, textShadowColor: "rgba(0, 0, 0, 0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  carouselSubtitle: { fontSize: 14, fontWeight: "500", color: "#E2E8F0", letterSpacing: 0.2 },
  carouselIndicators: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 12, gap: 8 },
  indicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#CBD5E1" },
  indicatorActive: { width: 24, backgroundColor: "#4C6EF5" },
  summaryContainer: { marginBottom: 24 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 4 },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  sectionHeaderTitle: { fontSize: 19, fontWeight: "800", color: "#1E293B", letterSpacing: -0.3 },
  viewAllButton: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 },
  viewAllText: { fontSize: 14, fontWeight: "600", color: "#4C6EF5" },
  summaryCard: { borderRadius: 20, elevation: 4, shadowColor: "#4C6EF5", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, overflow: "hidden" },
  summaryContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  summaryItem: { flex: 1, alignItems: "center", gap: 10 },
  summaryIconCircle: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  summaryInfo: { alignItems: "center" },
  summaryValue: { fontSize: 26, fontWeight: "800", color: "#1E293B", marginBottom: 2, letterSpacing: -0.5 },
  summaryLabel: { fontSize: 12, fontWeight: "600", color: "#64748B", letterSpacing: 0.2, textAlign: "center" },
  summaryDivider: { width: 1, height: 60, backgroundColor: "#E2E8F0" },
  quickAccessBlock: { marginBottom: 32 },
  quickAccessCardContainer: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16 },
  quickAccessGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quickAccessCard: { 
    width: "30.5%", 
    borderRadius: 16, 
    padding: 12, 
    paddingVertical: 14, 
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  quickAccessIconWrapper: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  quickAccessLabel: { fontSize: 12, fontWeight: "700", color: "#1E293B", textAlign: "center", marginBottom: 4, letterSpacing: -0.2, lineHeight: 14 },
  quickAccessBadgeText: { fontSize: 10, fontWeight: "600", color: "#64748B", textAlign: "center" },
  scheduleBlock: { marginBottom: 16 },
  scheduleCard: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 0, elevation: 4, shadowColor: "#4C6EF5", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12 },
  scheduleItem: { paddingVertical: 16, paddingHorizontal: 20 },
  scheduleItemBorder: { borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  scheduleRow: { flexDirection: "row", alignItems: "center" },
  scheduleIconCircle: { width: 52, height: 52, borderRadius: 16, justifyContent: "center", alignItems: "center", marginRight: 16 },
  scheduleInfo: { flex: 1, marginRight: 12 },
  scheduleSubject: { fontSize: 16, fontWeight: "700", color: "#1E293B", marginBottom: 6, letterSpacing: -0.2 },
  scheduleMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" },
  scheduleMetaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  scheduleClass: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  scheduleMetaDot: { fontSize: 10, color: "#CBD5E1", marginHorizontal: 2 },
  scheduleTime: { fontSize: 12, fontWeight: "500", color: "#64748B" },
  scheduleRoomRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  scheduleRoom: { fontSize: 12, fontWeight: "500", color: "#94A3B8" },
  scheduleStatusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, minWidth: 90 },
  statusDotBadge: { width: 6, height: 6, borderRadius: 3 },
  scheduleStatusText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  viewMoreButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  viewMoreText: { fontSize: 14, fontWeight: "600", color: "#4C6EF5" },
  eventsBlock: { marginBottom: 16 },
  eventsCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16 },
  eventItem: { paddingVertical: 12 },
  eventItemBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  eventRow: { flexDirection: "row", alignItems: "center" },
  eventIconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center", marginRight: 12 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 6 },
  eventDateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eventDateContainer: {},
  eventDate: { fontSize: 13, fontWeight: "600", color: "#4C6EF5" },
  viewMoreEventsButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F3F4F6", marginTop: 4 },
  viewMoreEventsText: { fontSize: 14, fontWeight: "600", color: "#4C6EF5" },
  tasksBlock: { marginBottom: 16 },
  tasksCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16 },
  taskItem: { paddingVertical: 12 },
  taskItemBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  taskRow: { flexDirection: "row", alignItems: "center" },
  taskIconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginRight: 12 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: "700", color: "#1E293B", marginBottom: 4 },
  taskMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  taskClass: { fontSize: 13, fontWeight: "500", color: "#64748B" },
  taskMetaDot: { fontSize: 13, color: "#CBD5E1" },
  taskCount: { fontSize: 13, fontWeight: "500", color: "#94A3B8" },
  taskDueBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF2FF", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 4 },
  taskDueText: { fontSize: 12, fontWeight: "600", color: "#4C6EF5" },
  activityBlock: { marginBottom: 16 },
  activitiesCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16 },
  activityItem: { paddingVertical: 12 },
  activityItemBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  activityRow: { flexDirection: "row", alignItems: "center" },
  activityIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: 12 },
  activityInfo: { flex: 1 },
  activityTitle: { fontSize: 14, fontWeight: "600", color: "#1A1A1A", marginBottom: 4 },
  activityTimeContainer: { flexDirection: "row", alignItems: "center", gap: 4 },
  activityTime: { fontSize: 12, color: "#94A3B8", fontWeight: "500" },
  viewMoreActivityButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F3F4F6", marginTop: 4 },
  viewMoreActivityText: { fontSize: 14, fontWeight: "600", color: "#4C6EF5" },
  floatingNavContainer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 0 },
  floatingNav: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 0, paddingVertical: 8, paddingHorizontal: 12, elevation: 0, shadowColor: "transparent", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0, shadowRadius: 0, height: 60 },
  navItemActive: { flex: 1, alignItems: "center", justifyContent: "center" },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  activeNavFilled: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, backgroundColor: "#4C6EF5", gap: 8 },
  navLabelActive: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
});
