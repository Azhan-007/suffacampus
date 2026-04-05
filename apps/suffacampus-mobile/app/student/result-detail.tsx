import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";

export default function ResultDetailScreen() {
  const params = useLocalSearchParams<{
    subject: string;
    marks: string;
    total: string;
    grade: string;
    examType: string;
    examDate: string;
    remarks: string;
  }>();

  const marks = Number(params.marks) || 0;
  const total = Number(params.total) || 100;
  const percentage = total > 0 ? Math.round((marks / total) * 100) : 0;
  const grade = params.grade || "N/A";
  const subject = params.subject || "Unknown";
  const examType = params.examType || "Exam";
  const examDate = params.examDate || "";
  const remarks = params.remarks || "";

  const getGradeColor = (g: string) => {
    if (g.startsWith("A")) return "#10B981";
    if (g.startsWith("B")) return "#3B82F6";
    if (g.startsWith("C")) return "#F59E0B";
    if (g.startsWith("D")) return "#EF4444";
    return "#6B7280";
  };

  const getSubjectIcon = (s: string) => {
    const icons: Record<string, string> = {
      Mathematics: "calculator",
      Physics: "flask",
      Chemistry: "test-tube",
      Biology: "leaf",
      English: "book-open-variant",
      "Computer Science": "code-braces",
      History: "book-clock",
      Geography: "earth",
    };
    return icons[s] || "book";
  };

  const getPerformanceLabel = (pct: number) => {
    if (pct >= 90) return { label: "Outstanding", color: "#10B981", icon: "star-circle" as const };
    if (pct >= 75) return { label: "Very Good", color: "#3B82F6", icon: "thumb-up" as const };
    if (pct >= 60) return { label: "Good", color: "#F59E0B", icon: "check-circle" as const };
    if (pct >= 50) return { label: "Average", color: "#F97316", icon: "minus-circle" as const };
    return { label: "Needs Improvement", color: "#EF4444", icon: "alert-circle" as const };
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const gradeColor = getGradeColor(grade);
  const perf = getPerformanceLabel(percentage);
  const subjectIcon = getSubjectIcon(subject);

  return (
    <Screen>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Result Details</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Score Hero Card */}
        <LinearGradient
          colors={
            percentage >= 90
              ? ["#10B981", "#059669"]
              : percentage >= 75
              ? ["#3B82F6", "#2563EB"]
              : percentage >= 60
              ? ["#F59E0B", "#D97706"]
              : percentage >= 50
              ? ["#F97316", "#EA580C"]
              : ["#EF4444", "#DC2626"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroIconRow}>
            <View style={styles.heroIconCircle}>
              <MaterialCommunityIcons name={subjectIcon as any} size={28} color="#FFF" />
            </View>
            <View style={styles.heroGradeCircle}>
              <Text style={styles.heroGradeText}>{grade}</Text>
            </View>
          </View>

          <Text style={styles.heroSubject}>{subject}</Text>
          <Text style={styles.heroExamType}>{examType}</Text>

          <View style={styles.heroScoreRow}>
            <Text style={styles.heroPercentage}>{percentage}%</Text>
            <Text style={styles.heroMarks}>
              {marks} / {total}
            </Text>
          </View>
        </LinearGradient>

        {/* Performance Assessment */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="chart-line" size={20} color="#4C6EF5" />
            <Text style={styles.cardTitle}>Performance Assessment</Text>
          </View>

          <View style={styles.perfRow}>
            <View style={[styles.perfBadge, { backgroundColor: perf.color + "15" }]}>
              <MaterialCommunityIcons name={perf.icon} size={20} color={perf.color} />
              <Text style={[styles.perfLabel, { color: perf.color }]}>{perf.label}</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(percentage, 100)}%`, backgroundColor: perf.color },
                ]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabelText}>0%</Text>
              <Text style={styles.progressLabelText}>50%</Text>
              <Text style={styles.progressLabelText}>100%</Text>
            </View>
          </View>
        </Card>

        {/* Details Card */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="information" size={20} color="#4C6EF5" />
            <Text style={styles.cardTitle}>Details</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Subject</Text>
            <Text style={styles.detailValue}>{subject}</Text>
          </View>
          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Exam Type</Text>
            <Text style={styles.detailValue}>{examType}</Text>
          </View>
          <View style={styles.separator} />

          {examDate ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Exam Date</Text>
                <Text style={styles.detailValue}>{formatDate(examDate)}</Text>
              </View>
              <View style={styles.separator} />
            </>
          ) : null}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Marks Obtained</Text>
            <Text style={[styles.detailValue, { fontWeight: "700" }]}>
              {marks} / {total}
            </Text>
          </View>
          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Percentage</Text>
            <Text style={[styles.detailValue, { color: perf.color, fontWeight: "700" }]}>
              {percentage}%
            </Text>
          </View>
          <View style={styles.separator} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Grade</Text>
            <View style={[styles.gradeBadge, { backgroundColor: gradeColor + "15" }]}>
              <Text style={[styles.gradeBadgeText, { color: gradeColor }]}>{grade}</Text>
            </View>
          </View>
        </Card>

        {/* Remarks */}
        {remarks ? (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="comment-text" size={20} color="#4C6EF5" />
              <Text style={styles.cardTitle}>Teacher Remarks</Text>
            </View>
            <Text style={styles.remarksText}>{remarks}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  scrollContent: { paddingBottom: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1E293B" },
  heroCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  heroIconRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  heroIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroGradeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroGradeText: { fontSize: 18, fontWeight: "800", color: "#FFF" },
  heroSubject: { fontSize: 22, fontWeight: "700", color: "#FFF", marginBottom: 4 },
  heroExamType: { fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 16 },
  heroScoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
  },
  heroPercentage: { fontSize: 42, fontWeight: "800", color: "#FFF" },
  heroMarks: { fontSize: 16, color: "rgba(255,255,255,0.8)" },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#FFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B" },
  perfRow: { marginBottom: 16 },
  perfBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  perfLabel: { fontSize: 15, fontWeight: "600" },
  progressContainer: { marginTop: 4 },
  progressBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  progressLabelText: { fontSize: 11, color: "#94A3B8" },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  detailLabel: { fontSize: 14, color: "#64748B" },
  detailValue: { fontSize: 14, color: "#1E293B", fontWeight: "500" },
  separator: { height: 1, backgroundColor: "#F1F5F9" },
  gradeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  gradeBadgeText: { fontSize: 14, fontWeight: "700" },
  remarksText: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 22,
  },
});
