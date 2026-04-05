import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { createQuestion } from "../../services/questionBankService";
import { uploadFile as uploadFileToServer } from "../../services/uploadService";
import { getClassLabels } from "../../services/classService";

export default function AddQuestionScreen() {
  const [questionType, setQuestionType] = useState<"mcq" | "image" | "pdf" | "document">("mcq");
  const [subject, setSubject] = useState("");
  const [class_, setClass] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [question, setQuestion] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [teacherId, setTeacherId] = useState<string>("");
  const [teacherName, setTeacherName] = useState("Teacher");

  useEffect(() => {
    const loadTeacherId = async () => {
      const id = await AsyncStorage.getItem("teacherId") || await AsyncStorage.getItem("userId");
      if (id) setTeacherId(id);
      const name = await AsyncStorage.getItem("userName");
      if (name) setTeacherName(name);
    };
    loadTeacherId();
    getClassLabels().then(labels => setClasses(labels)).catch(() => {});
  }, []);
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState<"A" | "B" | "C" | "D" | null>(null);
  const [selectedFile, setSelectedFile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science", "History", "Geography"];
  const [classes, setClasses] = useState<string[]>([]);
  const questionTypes = [
    { id: "mcq", label: "MCQ", icon: "format-list-checks" },
    { id: "image", label: "Image", icon: "image" },
    { id: "pdf", label: "PDF", icon: "file-pdf-box" },
    { id: "document", label: "Document", icon: "file-document" },
  ];

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile({
          uri: result.assets[0].uri,
          type: "image",
          name: `question_${Date.now()}.jpg`,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: questionType === "pdf" ? "application/pdf" : "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile({
          uri: result.assets[0].uri,
          type: result.assets[0].mimeType || "application/octet-stream",
          name: result.assets[0].name,
          size: result.assets[0].size,
        });
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick document");
    }
  };

  const uploadFile = async (file: { uri: string; name: string; type: string }): Promise<string> => {
    const { fileUrl } = await uploadFileToServer(file.uri, file.name, file.type);
    return fileUrl;
  };

  const handleSave = async () => {
    // Common validation
    if (!subject) {
      Alert.alert("Error", "Please select a subject");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title");
      return;
    }

    // Type-specific validation
    if (questionType === "mcq") {
      if (!question.trim()) {
        Alert.alert("Error", "Please enter the question");
        return;
      }
      if (!optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
        Alert.alert("Error", "Please fill all options (A, B, C, D)");
        return;
      }
      if (!correctAnswer) {
        Alert.alert("Error", "Please select the correct answer");
        return;
      }
    } else {
      // For file types
      if (!selectedFile) {
        Alert.alert("Error", `Please select a ${questionType}`);
        return;
      }
    }

    try {
      setSaving(true);
      setUploading(true);

      let questionData: any = {
        subject: subject,
        class: class_,
        title: title.trim(),
        description: description.trim(),
        type: questionType,
        uploadedBy: teacherName,
        uploadedDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        teacherId: teacherId,
      };

      if (questionType === "mcq") {
        const answerMap = {
          A: optionA.trim(),
          B: optionB.trim(),
          C: optionC.trim(),
          D: optionD.trim(),
        };

        questionData = {
          ...questionData,
          question: question.trim(),
          options: [optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim()],
          answer: answerMap[correctAnswer!],
          correctOption: correctAnswer,
        };
      } else {
        // Upload file and get URL
        const fileUrl = await uploadFile(selectedFile);
        questionData = {
          ...questionData,
          fileUrl: fileUrl,
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size,
        };
      }

      await createQuestion(questionData);

      Alert.alert("Success", "Content added successfully! Students can now view it in their Question Bank.", [
        {
          text: "Add Another",
          onPress: () => {
            resetForm();
          },
        },
        {
          text: "Go Back",
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.warn("Error adding question:", error);
      Alert.alert("Error", "Failed to add content. Please try again.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setQuestion("");
    setOptionA("");
    setOptionB("");
    setOptionC("");
    setOptionD("");
    setCorrectAnswer(null);
    setSelectedFile(null);
  };

  const renderAnswerButton = (letter: "A" | "B" | "C" | "D") => {
    const isSelected = correctAnswer === letter;
    return (
      <TouchableOpacity
        style={[styles.answerButton, isSelected && styles.answerButtonSelected]}
        onPress={() => setCorrectAnswer(letter)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons 
          name={isSelected ? "check-circle" : "circle-outline"} 
          size={24} 
          color={isSelected ? "#FFFFFF" : "#94A3B8"} 
        />
        <Text style={[styles.answerButtonText, isSelected && styles.answerButtonTextSelected]}>
          Option {letter}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Question</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.formCard}>
          {/* Question Type Selector */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Content Type *</Text>
            <View style={styles.typeSelector}>
              {questionTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeButton,
                    questionType === type.id && styles.typeButtonActive,
                  ]}
                  onPress={() => {
                    setQuestionType(type.id as any);
                    resetForm();
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={type.icon as any}
                    size={24}
                    color={questionType === type.id ? "#FFFFFF" : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.typeButtonText,
                      questionType === type.id && styles.typeButtonTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Subject & Class Selection */}
          <View style={styles.rowFields}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Subject *</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.chipsContainer}
                contentContainerStyle={{ paddingRight: 8 }}
              >
                {subjects.map((sub) => (
                  <TouchableOpacity
                    key={sub}
                    style={[styles.chip, subject === sub && styles.chipActive]}
                    onPress={() => setSubject(sub)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, subject === sub && styles.chipTextActive]}>
                      {sub}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.halfField}>
              <Text style={styles.label}>Class *</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.chipsContainer}
                contentContainerStyle={{ paddingRight: 8 }}
              >
                {classes.map((cls) => (
                  <TouchableOpacity
                    key={cls}
                    style={[styles.chip, class_ === cls && styles.chipActive]}
                    onPress={() => setClass(cls)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, class_ === cls && styles.chipTextActive]}>
                      {cls}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Title Field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder={
                questionType === "mcq"
                  ? "e.g., Algebra Chapter 5 Quiz"
                  : questionType === "image"
                  ? "e.g., Geometry Diagrams Set 1"
                  : questionType === "pdf"
                  ? "e.g., Physics Formula Sheet"
                  : "e.g., Study Notes Chapter 3"
              }
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={setTitle}
              editable={!saving}
            />
          </View>

          {/* Description Field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add a brief description..."
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              editable={!saving}
            />
          </View>

          {/* MCQ Form */}
          {questionType === "mcq" && (
            <>
              {/* Question Field */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Question *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Enter the question here..."
                  placeholderTextColor="#94A3B8"
                  value={question}
                  onChangeText={setQuestion}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!saving}
                />
              </View>

              {/* Options */}
              <Text style={styles.sectionTitle}>Answer Options</Text>
              
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Option A *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter option A"
                  placeholderTextColor="#94A3B8"
                  value={optionA}
                  onChangeText={setOptionA}
                  editable={!saving}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Option B *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter option B"
                  placeholderTextColor="#94A3B8"
                  value={optionB}
                  onChangeText={setOptionB}
                  editable={!saving}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Option C *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter option C"
                  placeholderTextColor="#94A3B8"
                  value={optionC}
                  onChangeText={setOptionC}
                  editable={!saving}
                />
              </View>

              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Option D *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter option D"
                  placeholderTextColor="#94A3B8"
                  value={optionD}
                  onChangeText={setOptionD}
                  editable={!saving}
                />
              </View>

              {/* Correct Answer Selection */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Correct Answer *</Text>
                <View style={styles.answerButtons}>
                  {renderAnswerButton('A')}
                  {renderAnswerButton('B')}
                  {renderAnswerButton('C')}
                  {renderAnswerButton('D')}
                </View>
              </View>
            </>
          )}

          {/* File Upload Forms */}
          {(questionType === "image" || questionType === "pdf" || questionType === "document") && (
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>
                {questionType === "image"
                  ? "Select Image *"
                  : questionType === "pdf"
                  ? "Select PDF *"
                  : "Select Document *"}
              </Text>
              
              {!selectedFile ? (
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={questionType === "image" ? pickImage : pickDocument}
                  disabled={saving}
                >
                  <MaterialCommunityIcons
                    name={
                      questionType === "image"
                        ? "image-plus"
                        : questionType === "pdf"
                        ? "file-pdf-box"
                        : "file-upload"
                    }
                    size={40}
                    color="#4C6EF5"
                  />
                  <Text style={styles.uploadButtonText}>
                    {questionType === "image"
                      ? "Tap to select image"
                      : questionType === "pdf"
                      ? "Tap to select PDF"
                      : "Tap to select document"}
                  </Text>
                  <Text style={styles.uploadButtonSubtext}>
                    {questionType === "image"
                      ? "JPG, PNG supported"
                      : questionType === "pdf"
                      ? "PDF files only"
                      : "All document formats"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.filePreview}>
                  {questionType === "image" ? (
                    <Image
                      source={{ uri: selectedFile.uri }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.documentPreview}>
                      <MaterialCommunityIcons
                        name={questionType === "pdf" ? "file-pdf-box" : "file-document"}
                        size={48}
                        color="#4C6EF5"
                      />
                      <Text style={styles.fileName} numberOfLines={2}>
                        {selectedFile.name}
                      </Text>
                      {selectedFile.size && (
                        <Text style={styles.fileSize}>
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </Text>
                      )}
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.removeFileButton}
                    onPress={() => setSelectedFile(null)}
                  >
                    <MaterialCommunityIcons name="close-circle" size={24} color="#EF4444" />
                    <Text style={styles.removeFileText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {uploading && (
                <View style={styles.uploadingIndicator}>
                  <ActivityIndicator size="small" color="#4C6EF5" />
                  <Text style={styles.uploadingText}>Uploading file...</Text>
                </View>
              )}
            </View>
          )}
        </Card>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, (saving || uploading) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || uploading}
        >
          {saving || uploading ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                {uploading ? "Uploading..." : "Saving..."}
              </Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="check-circle" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                {questionType === "mcq" ? "Save Question" : "Upload & Save"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  formCard: {
    padding: 20,
    marginBottom: 16,
  },
  rowFields: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  halfField: {
    flex: 1,
  },
  typeSelector: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 80,
  },
  typeButtonActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },
  typeButtonTextActive: {
    color: "#FFFFFF",
  },
  chipsContainer: {
    marginTop: 8,
    flexGrow: 0,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  chipActive: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1E293B",
    marginTop: 12,
    marginBottom: 18,
    letterSpacing: -0.5,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1E293B",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    fontWeight: "500",
  },
  textArea: {
    minHeight: 110,
    paddingTop: 14,
    textAlignVertical: "top",
  },
  answerButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  answerButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 60,
  },
  answerButtonSelected: {
    backgroundColor: "#4C6EF5",
    borderColor: "#4C6EF5",
  },
  answerButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
    textAlign: "center",
  },
  answerButtonTextSelected: {
    color: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#10B981",
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    minHeight: 56,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  uploadButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#4C6EF5",
    borderStyle: "dashed",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 180,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 8,
    textAlign: "center",
  },
  uploadButtonSubtext: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  filePreview: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
  },
  imagePreview: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 16,
  },
  documentPreview: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E293B",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 12,
  },
  fileSize: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 4,
  },
  removeFileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    marginTop: 16,
  },
  removeFileText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#EF4444",
  },
  uploadingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    padding: 14,
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
  },
  uploadingText: {
    fontSize: 14,
    color: "#4C6EF5",
    fontWeight: "700",
  },
});

