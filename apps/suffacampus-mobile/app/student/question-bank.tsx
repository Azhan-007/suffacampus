import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { getQuestions } from "../../services/questionBankService";

interface Question {
  id: string;
  subject: string;
  title: string;
  description?: string;
  type: "mcq" | "text" | "pdf" | "image" | "document";
  question?: string;
  options?: string[];
  answer?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  uploadedBy?: string;
  uploadedDate?: string;
  class?: string;
}

export default function QuestionBankScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: string]: string }>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<{ [key: string]: boolean }>({});
  const [filterType, setFilterType] = useState<string>("All");
  const [filterSubject, setFilterSubject] = useState<string>("All");

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      setLoading(true);

      const entries = await getQuestions();
      setQuestions(entries);
    } catch (err) {
      console.warn("Error fetching questions:", err);
      Alert.alert("Error", "Failed to load questions");
    } finally {
      setLoading(false);
    }
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
    };
    return colors[subject] || "#6B7280";
  };

  const getSubjectIcon = (subject: string) => {
    const icons: { [key: string]: string } = {
      "Mathematics": "calculator",
      "Physics": "atom",
      "Chemistry": "flask",
      "Biology": "leaf",
      "English": "book-open",
      "Computer Science": "laptop",
      "History": "clock",
      "Geography": "earth",
    };
    return icons[subject] || "book";
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "mcq": return "checkbox-multiple-marked";
      case "text": return "text-box";
      case "pdf": return "file-pdf-box";
      case "image": return "image";
      case "document": return "file-document";
      default: return "help-circle";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "mcq": return "#4C6EF5";
      case "text": return "#8B5CF6";
      case "pdf": return "#EF4444";
      case "image": return "#10B981";
      case "document": return "#F59E0B";
      default: return "#6B7280";
    }
  };

  const handleSelectAnswer = (questionId: string, option: string) => {
    if (!submittedAnswers[questionId]) {
      setSelectedAnswers({ ...selectedAnswers, [questionId]: option });
    }
  };

  const handleSubmitAnswer = (question: Question) => {
    if (!selectedAnswers[question.id]) {
      Alert.alert("Error", "Please select an answer first");
      return;
    }

    const isCorrect = selectedAnswers[question.id] === question.answer;
    setSubmittedAnswers({ ...submittedAnswers, [question.id]: true });

    Alert.alert(
      isCorrect ? "Correct! 🎉" : "Incorrect",
      isCorrect
        ? "Well done! You got it right."
        : "The correct answer is: " + question.answer,
      [{ text: "OK" }]
    );
  };

  const handleDownloadFile = async (url: string, fileName: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Cannot open this file type");
      }
    } catch (error) {
      console.warn("Error opening file:", error);
      Alert.alert("Error", "Failed to open file");
    }
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

  const subjects = Array.from(new Set(questions.map(q => q.subject)));
  const types = ["All", "MCQ", "Text", "PDF", "Image", "Document"];

  const filteredQuestions = questions.filter((q) => {
    const typeMatch = filterType === "All" || q.type.toLowerCase() === filterType.toLowerCase();
    const subjectMatch = filterSubject === "All" || q.subject === filterSubject;
    return typeMatch && subjectMatch;
  });

  const mcqCount = questions.filter(q => q.type === "mcq").length;
  const fileCount = questions.filter(q => ["pdf", "image", "document"].includes(q.type)).length;
  const textCount = questions.filter(q => q.type === "text").length;

  const renderQuestionCard = (question: Question) => {
    const subjectColor = getSubjectColor(question.subject);
    const subjectIcon = getSubjectIcon(question.subject);
    const typeIcon = getTypeIcon(question.type);
    const typeColor = getTypeColor(question.type);
    const isSubmitted = submittedAnswers[question.id];
    const selectedAnswer = selectedAnswers[question.id];

    return (
      <Card key={question.id} style={styles.questionCard}>
        <View style={[styles.accentBar, { backgroundColor: subjectColor }]} />
        
        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={[styles.subjectBadge, { backgroundColor: subjectColor + '15' }]}>
              <MaterialCommunityIcons name={subjectIcon as any} size={14} color={subjectColor} />
              <Text style={[styles.subjectText, { color: subjectColor }]}>
                {question.subject}
              </Text>
            </View>
            
            <View style={[styles.typeBadge, { backgroundColor: typeColor + '15' }]}>
              <MaterialCommunityIcons name={typeIcon as any} size={14} color={typeColor} />
              <Text style={[styles.typeText, { color: typeColor }]}>
                {question.type.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Title & Description */}
          <Text style={styles.questionTitle}>{question.title}</Text>
          {question.description && (
            <Text style={styles.questionDescription}>
              {question.description}
            </Text>
          )}

          {/* Content based on type */}
          {question.type === "mcq" && question.question && (
            <View style={styles.mcqContainer}>
              <View style={styles.questionTextContainer}>
                <MaterialCommunityIcons name="help-circle" size={18} color="#4C6EF5" />
                <Text style={styles.questionText}>{question.question}</Text>
              </View>

              <View style={styles.optionsContainer}>
                {question.options?.map((option, index) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrect = option === question.answer;
                  const showCorrect = isSubmitted && isCorrect;
                  const showWrong = isSubmitted && isSelected && !isCorrect;

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.optionButton,
                        isSelected && !isSubmitted && styles.optionSelected,
                        showCorrect && styles.optionCorrect,
                        showWrong && styles.optionWrong,
                      ]}
                      onPress={() => handleSelectAnswer(question.id, option)}
                      disabled={isSubmitted}
                    >
                      <View style={[
                        styles.optionCircle,
                        isSelected && !isSubmitted && styles.optionCircleSelected,
                        showCorrect && styles.optionCircleCorrect,
                        showWrong && styles.optionCircleWrong,
                      ]}>
                        {isSelected && !isSubmitted && (
                          <View style={styles.optionCircleInner} />
                        )}
                        {showCorrect && (
                          <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                        )}
                        {showWrong && (
                          <MaterialCommunityIcons name="close" size={16} color="#FFFFFF" />
                        )}
                      </View>
                      <Text style={[
                        styles.optionText,
                        isSelected && !isSubmitted && styles.optionTextSelected,
                        showCorrect && styles.optionTextCorrect,
                        showWrong && styles.optionTextWrong,
                      ]}>
                        {String.fromCharCode(65 + index)}. {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!isSubmitted && (
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => handleSubmitAnswer(question)}
                >
                  <Text style={styles.submitButtonText}>Submit Answer</Text>
                  <MaterialCommunityIcons name="check-circle" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              )}

              {isSubmitted && (
                <View style={selectedAnswer === question.answer ? styles.correctBanner : styles.wrongBanner}>
                  <MaterialCommunityIcons 
                    name={selectedAnswer === question.answer ? "check-circle" : "close-circle"} 
                    size={20} 
                    color="#FFFFFF" 
                  />
                  <Text style={styles.bannerText}>
                    {selectedAnswer === question.answer 
                      ? "Correct! Well done! 🎉" 
                      : "Incorrect. The correct answer is: " + question.answer}
                  </Text>
                </View>
              )}
            </View>
          )}

          {question.type === "text" && question.question && (
            <View style={styles.textQuestionContainer}>
              <View style={styles.textQuestionHeader}>
                <MaterialCommunityIcons name="text-box" size={20} color="#8B5CF6" />
                <Text style={styles.textQuestionLabel}>Question:</Text>
              </View>
              <Text style={styles.textQuestionContent}>{question.question}</Text>
              <View style={styles.textQuestionFooter}>
                <MaterialCommunityIcons name="information" size={16} color="#6B7280" />
                <Text style={styles.textQuestionHint}>
                  This is a subjective question. Please write your answer in your notebook.
                </Text>
              </View>
            </View>
          )}

          {question.type === "pdf" && question.fileUrl && (
            <View style={styles.fileContainer}>
              <View style={styles.filePreview}>
                <View style={styles.pdfIconContainer}>
                  <MaterialCommunityIcons name="file-pdf-box" size={40} color="#EF4444" />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {question.fileName}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    <MaterialCommunityIcons name="file-document" size={14} color="#6B7280" />
                    <Text style={styles.fileType}>PDF Document</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => handleDownloadFile(question.fileUrl!, question.fileName!)}
              >
                <MaterialCommunityIcons name="download" size={18} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Open PDF</Text>
              </TouchableOpacity>
            </View>
          )}

          {question.type === "image" && question.fileUrl && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: question.fileUrl }}
                style={styles.questionImage}
                resizeMode="cover"
              />
              {question.fileName && (
                <View style={styles.imageCaption}>
                  <MaterialCommunityIcons name="image" size={14} color="#10B981" />
                  <Text style={styles.imageCaptionText}>{question.fileName}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.viewImageButton}
                onPress={() => handleDownloadFile(question.fileUrl!, question.fileName!)}
              >
                <MaterialCommunityIcons name="arrow-expand" size={16} color="#10B981" />
                <Text style={styles.viewImageButtonText}>View Full Size</Text>
              </TouchableOpacity>
            </View>
          )}

          {question.type === "document" && question.fileUrl && (
            <View style={styles.fileContainer}>
              <View style={styles.filePreview}>
                <View style={styles.docIconContainer}>
                  <MaterialCommunityIcons name="file-document" size={40} color="#F59E0B" />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {question.fileName}
                  </Text>
                  <View style={styles.fileMetaRow}>
                    <MaterialCommunityIcons name="file" size={14} color="#6B7280" />
                    <Text style={styles.fileType}>Document</Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={styles.downloadButtonDoc}
                onPress={() => handleDownloadFile(question.fileUrl!, question.fileName!)}
              >
                <MaterialCommunityIcons name="download" size={18} color="#FFFFFF" />
                <Text style={styles.downloadButtonText}>Open Document</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footerRow}>
            <View style={styles.teacherInfo}>
              <MaterialCommunityIcons name="account" size={14} color="#6B7280" />
              <Text style={styles.teacherText}>{question.uploadedBy}</Text>
            </View>
            <Text style={styles.dateText}>{formatDate(question.uploadedDate || "")}</Text>
          </View>
        </View>
      </Card>
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
          <Text style={styles.headerTitle}>Question Bank</Text>
          <Text style={styles.headerSubtitle}>{questions.length} resources available</Text>
        </View>
        <View style={styles.placeholderButton} />
      </View>

      {/* Stats */}
      <LinearGradient
        colors={["#4C6EF5", "#6E8EFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statsGradient}
      >
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <MaterialCommunityIcons name="checkbox-multiple-marked" size={24} color="#FFFFFF" />
            <Text style={styles.statNumber}>{mcqCount}</Text>
            <Text style={styles.statLabel}>MCQs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <MaterialCommunityIcons name="file-document-multiple" size={24} color="#FFFFFF" />
            <Text style={styles.statNumber}>{fileCount}</Text>
            <Text style={styles.statLabel}>Files</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <MaterialCommunityIcons name="text-box" size={24} color="#FFFFFF" />
            <Text style={styles.statNumber}>{textCount}</Text>
            <Text style={styles.statLabel}>Texts</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Type Filter */}
      <View style={styles.filtersRow}>
        <Text style={styles.filterHeading}>Type:</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          {types.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterTab, filterType === type && styles.filterTabActive]}
              onPress={() => setFilterType(type)}
            >
              <Text style={[styles.filterTabText, filterType === type && styles.filterTabTextActive]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Subject Filter */}
      <View style={styles.filtersRow}>
        <Text style={styles.filterHeading}>Subject:</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          <TouchableOpacity
            style={[styles.filterTab, filterSubject === "All" && styles.filterTabActive]}
            onPress={() => setFilterSubject("All")}
          >
            <Text style={[styles.filterTabText, filterSubject === "All" && styles.filterTabTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {subjects.map((subject) => (
            <TouchableOpacity
              key={subject}
              style={[styles.filterTab, filterSubject === subject && styles.filterTabActive]}
              onPress={() => setFilterSubject(subject)}
            >
              <Text style={[styles.filterTabText, filterSubject === subject && styles.filterTabTextActive]}>
                {subject}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading questions...</Text>
        </View>
      ) : filteredQuestions.length === 0 ? (
        <View style={styles.centerContainer}>
          <View style={styles.emptyIconContainer}>
            <MaterialCommunityIcons name="book-open-variant" size={64} color="#D1D5DB" />
          </View>
          <Text style={styles.emptyTitle}>No questions found</Text>
          <Text style={styles.emptyText}>
            {filterType !== "All" || filterSubject !== "All"
              ? "Try adjusting your filters"
              : "Questions will appear here once added by teachers"}
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredQuestions.map(renderQuestionCard)}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
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
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  placeholderButton: {
    width: 40,
  },
  statsGradient: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
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
    alignItems: "center",
    gap: 6,
  },
  statDivider: {
    width: 1,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  statNumber: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.9)",
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  filterHeading: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  filterContent: {
    gap: 8,
  },
  filterTab: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  filterTabActive: {
    backgroundColor: "#4C6EF5",
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterTabTextActive: {
    color: "#FFFFFF",
  },
  listContainer: {
    gap: 16,
  },
  questionCard: {
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
    gap: 14,
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
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  questionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1A1A1A",
    lineHeight: 24,
  },
  questionDescription: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    lineHeight: 20,
  },
  mcqContainer: {
    gap: 12,
  },
  questionTextContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    gap: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#4C6EF5",
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    lineHeight: 22,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  optionSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4C6EF5",
  },
  optionCorrect: {
    backgroundColor: "#D1FAE5",
    borderColor: "#10B981",
  },
  optionWrong: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  optionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  optionCircleSelected: {
    borderColor: "#4C6EF5",
    backgroundColor: "#4C6EF5",
  },
  optionCircleCorrect: {
    borderColor: "#10B981",
    backgroundColor: "#10B981",
  },
  optionCircleWrong: {
    borderColor: "#EF4444",
    backgroundColor: "#EF4444",
  },
  optionCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  optionTextSelected: {
    fontWeight: "700",
    color: "#4C6EF5",
  },
  optionTextCorrect: {
    fontWeight: "700",
    color: "#10B981",
  },
  optionTextWrong: {
    fontWeight: "700",
    color: "#EF4444",
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4C6EF5",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  correctBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10B981",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  wrongBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF4444",
    padding: 14,
    borderRadius: 12,
    gap: 10,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 20,
  },
  textQuestionContainer: {
    backgroundColor: "#F9F5FF",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#E9D5FF",
  },
  textQuestionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textQuestionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8B5CF6",
  },
  textQuestionContent: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
    lineHeight: 22,
  },
  textQuestionFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  textQuestionHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
    fontStyle: "italic",
  },
  fileContainer: {
    gap: 12,
  },
  filePreview: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pdfIconContainer: {
    width: 60,
    height: 60,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  docIconContainer: {
    width: 60,
    height: 60,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: {
    flex: 1,
    gap: 8,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
    lineHeight: 20,
  },
  fileMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fileType: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  downloadButtonDoc: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F59E0B",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  imageContainer: {
    gap: 12,
  },
  questionImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  imageCaption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  imageCaptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#10B981",
  },
  viewImageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 2,
    borderColor: "#10B981",
  },
  viewImageButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#10B981",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  teacherInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  teacherText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  dateText: {
    fontSize: 12,
    fontWeight: "500",
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
    textAlign: "center",
  },
  loadingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
});
