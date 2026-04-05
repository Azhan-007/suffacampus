import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import Section from "../../components/Section";
import { getTimetable } from "../../services/timetableService";

interface TimetableEntry {
  id: string;
  subject: string;
  teacher: string;
  startTime: string;
  endTime: string;
  room: string;
  color?: string;
}

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TimetableScreen() {
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0); // Monday = 0

  useEffect(() => {
    fetchTimetable();
  }, [selectedDay]);

  const fetchTimetable = async () => {
    try {
      setLoading(true);

      const classId = await AsyncStorage.getItem("classId") ?? "";
      if (!classId) {
        setTimetable([]);
        return;
      }
      const currentDay = daysOfWeek[selectedDay];
      const entries = await getTimetable({ classId, day: currentDay });
      setTimetable(entries);
    } catch (err) {
      console.warn("Error fetching timetable:", err);
    } finally {
      setLoading(false);
    }
  };

  const renderSubjectCard = (entry: TimetableEntry) => (
    <TouchableOpacity key={entry.id} activeOpacity={0.7}>
      <Card style={styles.subjectCard}>
        <View style={styles.cardRow}>
          {/* Time Badge */}
          <View style={styles.timeBadgeContainer}>
            <View style={[styles.timeBadge, { backgroundColor: `${entry.color}15` }]}>
              <Text style={[styles.timeText, { color: entry.color }]}>{entry.startTime}</Text>
              <View style={[styles.timeDivider, { backgroundColor: entry.color }]} />
              <Text style={[styles.timeText, { color: entry.color }]}>{entry.endTime}</Text>
            </View>
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <Text style={styles.subjectName}>{entry.subject}</Text>
            
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="account-outline" size={16} color="#94A3B8" />
              <Text style={styles.detailText}>{entry.teacher}</Text>
            </View>

            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={16} color="#94A3B8" />
              <Text style={styles.detailText}>{entry.room}</Text>
            </View>
          </View>

          {/* Color Indicator */}
          <View style={[styles.colorIndicator, { backgroundColor: entry.color }]} />
        </View>
      </Card>
    </TouchableOpacity>
  );

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Timetable</Text>
          <Text style={styles.headerSubtitle}>Class 10-A</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Day Selector */}
      <View style={styles.daySelectorContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daySelector}
        >
          {daysOfWeek.map((day, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setSelectedDay(index)}
              style={[
                styles.dayButton,
                selectedDay === index && styles.dayButtonActive
              ]}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.dayText,
                selectedDay === index && styles.dayTextActive
              ]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading timetable...</Text>
        </View>
      ) : timetable.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialIcons name="event-busy" size={64} color="#D1D5DB" />
          <Text style={styles.emptyText}>No classes scheduled</Text>
        </View>
      ) : (
        <Section title="Today's Timetable">
          {timetable.map(renderSubjectCard)}
        </Section>
      )}
    </Screen>
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
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#94A3B8",
    marginTop: 2,
  },
  daySelectorContainer: {
    marginBottom: 24,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  daySelector: {
    flexDirection: "row",
    gap: 8,
  },
  dayButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  dayButtonActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  dayText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  dayTextActive: {
    color: "#FFFFFF",
  },
  subjectCard: {
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  timeBadgeContainer: {
    marginRight: 16,
  },
  timeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 70,
  },
  timeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  timeDivider: {
    width: 20,
    height: 2,
    marginVertical: 4,
    borderRadius: 1,
  },
  cardContent: {
    flex: 1,
    gap: 8,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  colorIndicator: {
    width: 4,
    height: "100%",
    borderRadius: 2,
    marginLeft: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: 16,
  },
});
