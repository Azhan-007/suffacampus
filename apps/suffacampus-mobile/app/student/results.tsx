import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { getStudentResults } from "../../services/resultService";

interface ResultEntry {
  id: string;
  subject: string;
  marks: number;
  total: number;
  grade: string;
  examType?: string;
  examDate?: string;
  remarks?: string;
}

export default function ResultsScreen() {
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPercentage, setTotalPercentage] = useState(0);
  const [classRank, setClassRank] = useState(0);
  const [filterExam, setFilterExam] = useState<string>("All");
  const [examTypes, setExamTypes] = useState<string[]>(["All"]);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      setLoading(true);

      const currentStudentId = await AsyncStorage.getItem("studentId");
      if (!currentStudentId) { router.replace("/login" as any); return; }

      const entries = await getStudentResults({
        studentId: currentStudentId,
        published: true,
      });
      const exams = new Set(entries.map((e) => e.examType ?? "N/A").filter(Boolean));
      setResults(entries);
      setExamTypes(["All", ...Array.from(exams)]);
      if (entries.length > 0) {
        const totalMarks = entries.reduce((sum, e) => sum + e.marks, 0);
        const totalPossible = entries.reduce((sum, e) => sum + e.total, 0);
        setTotalPercentage(Math.round((totalMarks / totalPossible) * 100));
      }
    } catch (err) {
      console.warn("Error fetching results:", err);
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "#10B981";
    if (grade.startsWith("B")) return "#3B82F6";
    if (grade.startsWith("C")) return "#F59E0B";
    if (grade.startsWith("D")) return "#EF4444";
    return "#6B7280";
  };

  const getSubjectColor = (subject: string) => {
    const colors: { [key: string]: string } = {
      "Mathematics": "#4C6EF5",
      "Physics": "#10B981",
      "Chemistry": "#EC4899",
      "Biology": "#14B8A6",
      "English": "#F59E0B",
      "Computer Science": "#8B5CF6",
      "History": "#78716C",
      "Geography": "#0EA5E9",
      "English Literature": "#F59E0B",
    };
    return colors[subject] || "#6B7280";
  };

  const getSubjectIcon = (subject: string) => {
    const icons: { [key: string]: any } = {
      "Mathematics": "calculator",
      "Physics": "flask",
      "Chemistry": "test-tube",
      "Biology": "leaf",
      "English": "book-open-variant",
      "Computer Science": "code-braces",
      "History": "book-clock",
      "Geography": "earth",
      "English Literature": "book-open-page-variant",
    };
    return icons[subject] || "book";
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const filteredResults = filterExam === "All" 
    ? results 
    : results.filter((r) => r.examType === filterExam);

  const renderResultCard = (entry: ResultEntry) => {
    const percentage = Math.round((entry.marks / entry.total) * 100);
    const gradeColor = getGradeColor(entry.grade);
    const subjectColor = getSubjectColor(entry.subject);
    const subjectIcon = getSubjectIcon(entry.subject);

    return (
      <TouchableOpacity 
        key={entry.id} 
        activeOpacity={0.7}
        onPress={() => {
          router.push({
            pathname: "/student/result-detail",
            params: {
              subject: entry.subject,
              marks: String(entry.marks),
              total: String(entry.total),
              grade: entry.grade,
              examType: entry.examType ?? "",
              examDate: entry.examDate ?? "",
              remarks: entry.remarks ?? "",
            },
          });
        }}
      >
        <Card style={styles.resultCard}>
          {/* Color accent bar */}
          <View style={[styles.accentBar, { backgroundColor: subjectColor }]} />
          
          <View style={styles.cardContent}>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <View style={[styles.subjectBadge, { backgroundColor: subjectColor + '15' }]}>
                <MaterialCommunityIcons name={subjectIcon} size={16} color={subjectColor} />
                <Text style={[styles.subjectText, { color: subjectColor }]}>
                  {entry.subject}
                </Text>
              </View>
              
              {entry.examType && (
                <View style={styles.examBadge}>
                  <MaterialCommunityIcons name="clipboard-text" size={14} color="#6B7280" />
                  <Text style={styles.examText}>{entry.examType}</Text>
                </View>
              )}
            </View>

            {/* Score Display */}
            <LinearGradient
              colors={percentage >= 90 ? ['#10B981', '#059669'] : 
                      percentage >= 75 ? ['#3B82F6', '#2563EB'] :
                      percentage >= 60 ? ['#F59E0B', '#D97706'] : 
                      percentage >= 50 ? ['#F97316', '#EA580C'] :
                      ['#EF4444', '#DC2626']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scoreContainer}
            >
              <View style={styles.scoreLeft}>
                <MaterialCommunityIcons name="trophy" size={24} color="#FFFFFF" />
                <View>
                  <Text style={styles.marksText}>
                    {entry.marks} / {entry.total}
                  </Text>
                  <Text style={styles.percentageLabel}>{percentage}% Scored</Text>
                </View>
              </View>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeLabel}>GRADE</Text>
                <Text style={styles.gradeText}>{entry.grade}</Text>
              </View>
            </LinearGradient>

            {/* Remarks */}
            {entry.remarks && (
              <View style={styles.remarksContainer}>
                <MaterialCommunityIcons name="message-text" size={16} color="#6B7280" />
                <Text style={styles.remarksText} numberOfLines={2}>
                  {entry.remarks}
                </Text>
              </View>
            )}

            {/* Footer */}
            {entry.examDate && (
              <View style={styles.footerRow}>
                <MaterialCommunityIcons name="calendar" size={16} color="#6B7280" />
                <Text style={styles.dateText}>Exam Date: {formatDate(entry.examDate)}</Text>
              </View>
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Exam Results</Text>
          <Text style={styles.headerSubtitle}>{results.length} subjects</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconContainer}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={64} color="#D1D5DB" />
          </View>
          <Text style={styles.emptyTitle}>No results available</Text>
          <Text style={styles.emptyText}>Your exam results will appear here once published</Text>
        </View>
      ) : (
        <>
          {/* Stats Overview Card */}
          <LinearGradient
            colors={['#4C6EF5', '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsCard}
          >
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons name="chart-line" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.statValue}>{totalPercentage}%</Text>
                <Text style={styles.statLabel}>Overall Score</Text>
              </View>
              
              <View style={styles.statDivider} />
              
              <View style={styles.statItem}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons name="trophy" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.statValue}>#{classRank || "-"}</Text>
                <Text style={styles.statLabel}>Class Rank</Text>
              </View>
              
              <View style={styles.statDivider} />
              
              <View style={styles.statItem}>
                <View style={styles.statIconContainer}>
                  <MaterialCommunityIcons name="book-open-variant" size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.statValue}>{results.length}</Text>
                <Text style={styles.statLabel}>Subjects</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Exam Filter */}
          {examTypes.length > 1 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.filterContainer}
              contentContainerStyle={styles.filterContent}
            >
              {examTypes.map((exam) => (
                <TouchableOpacity
                  key={exam}
                  style={[styles.filterTab, filterExam === exam && styles.filterTabActive]}
                  onPress={() => setFilterExam(exam)}
                >
                  <Text style={[styles.filterTabText, filterExam === exam && styles.filterTabTextActive]}>
                    {exam}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Results List */}
          <View style={styles.listContainer}>
            {filteredResults.map(renderResultCard)}
          </View>
        </>
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
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  statsCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
  },
  statDivider: {
    width: 1,
    height: 60,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  filterContainer: {
    marginBottom: 20,
    maxHeight: 50,
  },
  filterContent: {
    gap: 10,
  },
  filterTab: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  filterTabActive: {
    backgroundColor: "#4C6EF5",
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },
  listContainer: {
    gap: 16,
  },
  resultCard: {
    marginBottom: 0,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  cardContent: {
    gap: 12,
    paddingLeft: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subjectBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  subjectText: {
    fontSize: 13,
    fontWeight: "700",
  },
  examBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  examText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
  },
  scoreLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  marksText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  percentageLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
    marginTop: 2,
  },
  gradeBadge: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    minWidth: 60,
  },
  gradeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255, 255, 255, 0.8)",
    marginBottom: 2,
  },
  gradeText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  remarksContainer: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#4C6EF5",
  },
  remarksText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    lineHeight: 18,
    fontStyle: "italic",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  dateText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B7280",
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
});
