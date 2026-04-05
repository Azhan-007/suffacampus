import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { createQuestion, deleteQuestion, getQuestions, Question, updateQuestion } from "../../services/questionBankService";
import { getClassLabels } from "../../services/classService";

export default function TeacherQuestionBankScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>("All");
  const [filterSubject, setFilterSubject] = useState<string>("All");
  const [teacherName, setTeacherName] = useState<string>("Teacher");
  
  // Form state
  const [formData, setFormData] = useState({
    subject: "",
    title: "",
    description: "",
    type: "mcq" as "mcq" | "text" | "pdf" | "image" | "document",
    question: "",
    options: ["", "", "", ""],
    answer: "",
    fileUrl: "",
    fileName: "",
    fileType: "",
    class: "",
  });

  const [classes, setClasses] = useState<string[]>(["All"]);
  const subjects = ["All", "Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science", "History", "Geography"];
  const questionTypes = ["mcq", "text", "pdf", "image", "document"];

  useEffect(() => {
    fetchQuestions();
    AsyncStorage.getItem("userName").then((name) => {
      if (name) setTeacherName(name);
    });
    getClassLabels().then(labels => setClasses(["All", ...labels])).catch(() => {});
  }, []);;

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const entries = await getQuestions();
      setQuestions(entries);
    } catch (err: any) {
      console.warn("Error fetching questions:", err?.message || err);
      Alert.alert("Error", "Failed to load questions");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.subject || !formData.title || !formData.class) {
      Alert.alert("Error", "Please fill in subject, title, and class");
      return;
    }

    if (formData.type === "mcq") {
      if (!formData.question || formData.options.some(opt => !opt) || !formData.answer) {
        Alert.alert("Error", "Please complete all MCQ fields");
        return;
      }
    } else if (formData.type === "text") {
      if (!formData.question) {
        Alert.alert("Error", "Please enter the question");
        return;
      }
    } else if (["pdf", "image", "document"].includes(formData.type)) {
      if (!formData.fileUrl) {
        Alert.alert("Error", "Please upload a file");
        return;
      }
    }

    try {
      const dataToSave = {
        ...formData,
        uploadedBy: teacherName,
        uploadedDate: new Date().toISOString(),
      };

      if (editingId) {
        await updateQuestion(editingId, dataToSave);
        Alert.alert("Success", "Question updated successfully!");
      } else {
        await createQuestion(dataToSave);
        Alert.alert("Success", "Question added successfully!");
      }

      setModalVisible(false);
      resetForm();
      fetchQuestions();
    } catch (error) {
      console.warn("Error saving question:", error);
      Alert.alert("Error", "Failed to save question");
    }
  };

  const handleEdit = (question: Question) => {
    setEditingId(question.id);
    setFormData({
      subject: question.subject,
      title: question.title,
      description: question.description ?? "",
      type: question.type,
      question: question.question || "",
      options: question.options || ["", "", "", ""],
      answer: question.answer || "",
      fileUrl: question.fileUrl || "",
      fileName: question.fileName || "",
      fileType: question.fileType || "",
      class: question.class ?? "",
    });
    setModalVisible(true);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert(
      "Delete Question",
      "Are you sure you want to delete '" + title + "'?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteQuestion(id);
              Alert.alert("Success", "Question deleted successfully!");
              fetchQuestions();
            } catch (error) {
              console.warn("Error deleting question:", error);
              Alert.alert("Error", "Failed to delete question");
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      subject: "",
      title: "",
      description: "",
      type: "mcq",
      question: "",
      options: ["", "", "", ""],
      answer: "",
      fileUrl: "",
      fileName: "",
      fileType: "",
      class: "",
    });
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

  const filteredQuestions = questions.filter((q) => {
    const classMatch = filterClass === "All" || q.class === filterClass;
    const subjectMatch = filterSubject === "All" || q.subject === filterSubject;
    return classMatch && subjectMatch;
  });

  const mcqCount = questions.filter(q => q.type === "mcq").length;
  const fileCount = questions.filter(q => ["pdf", "image", "document"].includes(q.type)).length;

  const renderQuestionCard = (question: Question) => {
    const subjectColor = getSubjectColor(question.subject);
    const typeIcon = getTypeIcon(question.type);
    const typeColor = getTypeColor(question.type);

    return (
      <Card key={question.id} style={styles.questionCard}>
        <View style={[styles.accentBar, { backgroundColor: subjectColor }]} />
        
        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={[styles.subjectBadge, { backgroundColor: subjectColor + '15' }]}>
              <Text style={[styles.subjectText, { color: subjectColor }]}>
                {question.subject}
              </Text>
            </View>
            
            <View style={styles.metaRow}>
              <View style={[styles.typeBadge, { backgroundColor: typeColor + '15' }]}>
                <MaterialCommunityIcons name={typeIcon} size={14} color={typeColor} />
                <Text style={[styles.typeText, { color: typeColor }]}>
                  {question.type.toUpperCase()}
                </Text>
              </View>
              
              <View style={styles.classBadge}>
                <MaterialCommunityIcons name="google-classroom" size={12} color="#4C6EF5" />
                <Text style={styles.classText}>{question.class}</Text>
              </View>
            </View>
          </View>

          {/* Title & Description */}
          <Text style={styles.questionTitle}>{question.title}</Text>
          {question.description && (
            <Text style={styles.questionDescription} numberOfLines={2}>
              {question.description}
            </Text>
          )}

          {/* Content Preview */}
          {question.type === "mcq" && question.question && (
            <View style={styles.previewContainer}>
              <MaterialCommunityIcons name="help-circle" size={16} color="#6B7280" />
              <Text style={styles.previewText} numberOfLines={1}>
                {question.question}
              </Text>
            </View>
          )}

          {["pdf", "image", "document"].includes(question.type) && question.fileName && (
            <View style={styles.fileContainer}>
              <MaterialCommunityIcons name={typeIcon} size={20} color={typeColor} />
              <Text style={styles.fileName} numberOfLines={1}>
                {question.fileName}
              </Text>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footerRow}>
            <View style={styles.teacherInfo}>
              <MaterialCommunityIcons name="account" size={14} color="#6B7280" />
              <Text style={styles.teacherText}>{question.uploadedBy}</Text>
            </View>
            <Text style={styles.dateText}>{formatDate(question.uploadedDate ?? "")}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => handleEdit(question)}
            >
              <MaterialCommunityIcons name="pencil" size={16} color="#4C6EF5" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(question.id, question.title)}
            >
              <MaterialCommunityIcons name="delete" size={16} color="#EF4444" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => {
                Alert.alert("Preview", "Question preview for: " + question.title);
              }}
            >
              <MaterialCommunityIcons name="eye" size={16} color="#10B981" />
              <Text style={styles.viewButtonText}>View</Text>
            </TouchableOpacity>
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
          <Text style={styles.headerSubtitle}>{questions.length} total items</Text>
        </View>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setModalVisible(true);
          }}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <MaterialCommunityIcons name="folder-multiple" size={28} color="#4C6EF5" />
          <Text style={styles.statValue}>{questions.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialCommunityIcons name="checkbox-multiple-marked" size={28} color="#10B981" />
          <Text style={styles.statValue}>{mcqCount}</Text>
          <Text style={styles.statLabel}>MCQs</Text>
        </View>
        <View style={styles.statCard}>
          <MaterialCommunityIcons name="file-document-multiple" size={28} color="#F59E0B" />
          <Text style={styles.statValue}>{fileCount}</Text>
          <Text style={styles.statLabel}>Files</Text>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersRow}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          <Text style={styles.filterLabel}>Subject:</Text>
          {subjects.map((subj) => (
            <TouchableOpacity
              key={subj}
              style={[styles.filterTab, filterSubject === subj && styles.filterTabActive]}
              onPress={() => setFilterSubject(subj)}
            >
              <Text style={[styles.filterTabText, filterSubject === subj && styles.filterTabTextActive]}>
                {subj}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filtersRow}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          <Text style={styles.filterLabel}>Class:</Text>
          {classes.map((cls) => (
            <TouchableOpacity
              key={cls}
              style={[styles.filterTab, filterClass === cls && styles.filterTabActive]}
              onPress={() => setFilterClass(cls)}
            >
              <Text style={[styles.filterTabText, filterClass === cls && styles.filterTabTextActive]}>
                {cls}
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
          <Text style={styles.emptyTitle}>No questions yet</Text>
          <Text style={styles.emptyText}>
            Tap the + button to add questions
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredQuestions.map(renderQuestionCard)}
        </View>
      )}

      {/* Add/Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? "Edit Question" : "Add New Question"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <MaterialCommunityIcons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Form */}
              <View style={styles.formContainer}>
                {/* Question Type */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Question Type *</Text>
                  <View style={styles.chipContainer}>
                    {questionTypes.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.chip,
                          formData.type === type && styles.chipActive,
                        ]}
                        onPress={() => setFormData({ ...formData, type: type as any })}
                      >
                        <MaterialCommunityIcons 
                          name={getTypeIcon(type)} 
                          size={16} 
                          color={formData.type === type ? "#FFFFFF" : "#6B7280"}
                        />
                        <Text
                          style={[
                            styles.chipText,
                            formData.type === type && styles.chipTextActive,
                          ]}
                        >
                          {type.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Subject */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Subject *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipContainer}>
                      {subjects.filter(s => s !== "All").map((subject) => (
                        <TouchableOpacity
                          key={subject}
                          style={[
                            styles.chip,
                            formData.subject === subject && styles.chipActive,
                          ]}
                          onPress={() => setFormData({ ...formData, subject })}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              formData.subject === subject && styles.chipTextActive,
                            ]}
                          >
                            {subject}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                {/* Class */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Class *</Text>
                  <View style={styles.chipContainer}>
                    {classes.filter(c => c !== "All").map((cls) => (
                      <TouchableOpacity
                        key={cls}
                        style={[
                          styles.chip,
                          formData.class === cls && styles.chipActive,
                        ]}
                        onPress={() => setFormData({ ...formData, class: cls })}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            formData.class === cls && styles.chipTextActive,
                          ]}
                        >
                          {cls}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Title */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Title *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Chapter 5 Practice Questions"
                    value={formData.title}
                    onChangeText={(text) => setFormData({ ...formData, title: text })}
                  />
                </View>

                {/* Description */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Brief description of the questions..."
                    value={formData.description}
                    onChangeText={(text) => setFormData({ ...formData, description: text })}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* MCQ Fields */}
                {formData.type === "mcq" && (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Question *</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Enter your question here..."
                        value={formData.question}
                        onChangeText={(text) => setFormData({ ...formData, question: text })}
                        multiline
                        numberOfLines={3}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Options *</Text>
                      {formData.options.map((option, index) => (
                        <View key={index} style={styles.optionInputRow}>
                          <Text style={styles.optionLabel}>{String.fromCharCode(65 + index)}.</Text>
                          <TextInput
                            style={[styles.input, styles.optionInput]}
                            placeholder={"Option " + String.fromCharCode(65 + index)}
                            value={option}
                            onChangeText={(text) => {
                              const newOptions = [...formData.options];
                              newOptions[index] = text;
                              setFormData({ ...formData, options: newOptions });
                            }}
                          />
                        </View>
                      ))}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Correct Answer *</Text>
                      <View style={styles.chipContainer}>
                        {formData.options.map((option, index) => (
                          option && (
                            <TouchableOpacity
                              key={index}
                              style={[
                                styles.chip,
                                formData.answer === option && styles.chipActive,
                              ]}
                              onPress={() => setFormData({ ...formData, answer: option })}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  formData.answer === option && styles.chipTextActive,
                                ]}
                              >
                                {String.fromCharCode(65 + index)}. {option.substring(0, 20)}{option.length > 20 ? '...' : ''}
                              </Text>
                            </TouchableOpacity>
                          )
                        ))}
                      </View>
                    </View>
                  </>
                )}

                {/* Text Question Fields */}
                {formData.type === "text" && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Question Text *</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Enter your question or prompt..."
                      value={formData.question}
                      onChangeText={(text) => setFormData({ ...formData, question: text })}
                      multiline
                      numberOfLines={5}
                    />
                  </View>
                )}

                {/* File Upload Fields */}
                {["pdf", "image", "document"].includes(formData.type) && (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>File URL *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter file URL (e.g., https://example.com/file.pdf)"
                        value={formData.fileUrl}
                        onChangeText={(text) => setFormData({ ...formData, fileUrl: text })}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>File Name *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Enter file name (e.g., Chapter5_Notes.pdf)"
                        value={formData.fileName}
                        onChangeText={(text) => setFormData({ ...formData, fileName: text })}
                      />
                    </View>
                    {formData.fileName && formData.fileUrl && (
                      <View style={styles.selectedFile}>
                        <MaterialCommunityIcons name={getTypeIcon(formData.type)} size={20} color="#10B981" />
                        <Text style={styles.selectedFileName}>{formData.fileName}</Text>
                      </View>
                    )}
                  </>
                )}

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setModalVisible(false);
                      resetForm();
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                  >
                    <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>
                      {editingId ? "Update" : "Add Question"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4C6EF5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 4,
  },
  filtersRow: {
    marginBottom: 12,
  },
  filterContainer: {
    maxHeight: 50,
  },
  filterContent: {
    gap: 10,
    alignItems: "center",
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginRight: 4,
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
    gap: 12,
    paddingLeft: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subjectBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  subjectText: {
    fontSize: 13,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    gap: 6,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  classBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  classText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  questionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
    lineHeight: 22,
  },
  questionDescription: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 20,
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#4B5563",
    fontStyle: "italic",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#4C6EF5",
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#EF4444",
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
  },
  viewButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#D1FAE5",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#10B981",
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#10B981",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  formContainer: {
    padding: 20,
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  chipActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  optionInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4C6EF5",
    width: 24,
  },
  optionInput: {
    flex: 1,
    marginBottom: 0,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 10,
    borderWidth: 2,
    borderColor: "#4C6EF5",
    borderStyle: "dashed",
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  selectedFile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D1FAE5",
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginTop: 8,
  },
  selectedFileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#10B981",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#6B7280",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
