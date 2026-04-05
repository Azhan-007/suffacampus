import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

// ... imports

export interface ResultFormData {
    studentId: string;
    studentName: string;
    class: string;
    subject: string;
    marks: string;
    total: string;
    examType: string;
    examDate: string;
    remarks: string;
    published: boolean;
}

interface ResultFormProps {
    initialData: ResultFormData;
    onClose: () => void;
    onSave: (data: ResultFormData) => void;
    isEditing: boolean;
    classes?: string[];
    subjects?: string[];
}

const DEFAULT_CLASSES = ["10A", "10B", "10C", "9A", "9B", "9C"];
const DEFAULT_SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science", "History", "Geography"];
const EXAM_TYPES = ["Mid Term", "Final Term", "Unit Test", "Quiz", "Assignment"];

export function ResultForm({
    initialData,
    onClose,
    onSave,
    isEditing,
    classes,
    subjects,
}: ResultFormProps) {
    const classList = classes && classes.length > 0 ? classes : DEFAULT_CLASSES;
    const subjectList = subjects && subjects.length > 0 ? subjects : DEFAULT_SUBJECTS;
    const [formData, setFormData] = React.useState<ResultFormData>(initialData);

    const handleChange = (changes: Partial<ResultFormData>) => {
        setFormData(prev => ({ ...prev, ...changes }));
    };

    const footer = (
        <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={() => onSave(formData)}>
                <LinearGradient
                    colors={["#4C6EF5", "#6B8AFF"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.saveButtonGradient}
                >
                    <MaterialCommunityIcons
                        name={isEditing ? "check" : "plus"}
                        size={20}
                        color="#FFFFFF"
                    />
                    <Text style={styles.saveButtonText}>
                        {isEditing ? "Update" : "Add Result"}
                    </Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    return (
        <BottomSheet
            title={isEditing ? "Edit Result" : "Add New Result"}
            onClose={onClose}
            footer={footer}
            maxHeight={750}
        >
            <View style={styles.formContent}>
                {/* Student Details */}
                <View style={styles.row}>
                    <View style={styles.col}>
                        <Text style={styles.label}>Student ID *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. std001"
                            placeholderTextColor="#9CA3AF"
                            value={formData.studentId}
                            onChangeText={(text) => handleChange({ studentId: text })}
                        />
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.label}>Student Name *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Name"
                            placeholderTextColor="#9CA3AF"
                            value={formData.studentName}
                            onChangeText={(text) => handleChange({ studentName: text })}
                        />
                    </View>
                </View>

                {/* Class Selector */}
                <Text style={styles.label}>Class *</Text>
                <View style={styles.chipContainer}>
                    {classList.map((cls) => (
                        <TouchableOpacity
                            key={cls}
                            style={[styles.chip, formData.class === cls && styles.chipActive]}
                            onPress={() => handleChange({ class: cls })}
                        >
                            <Text style={[styles.chipText, formData.class === cls && styles.chipTextActive]}>
                                {cls}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Subject Selector */}
                <Text style={styles.label}>Subject *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollChips}>
                    <View style={styles.chipContainer}>
                        {subjectList.map((subj) => (
                            <TouchableOpacity
                                key={subj}
                                style={[styles.chip, formData.subject === subj && styles.chipActive]}
                                onPress={() => handleChange({ subject: subj })}
                            >
                                <Text style={[styles.chipText, formData.subject === subj && styles.chipTextActive]}>
                                    {subj}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                {/* Exam Type */}
                <Text style={styles.label}>Exam Type *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollChips}>
                    <View style={styles.chipContainer}>
                        {EXAM_TYPES.map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[styles.chip, formData.examType === type && styles.chipActive]}
                                onPress={() => handleChange({ examType: type })}
                            >
                                <Text style={[styles.chipText, formData.examType === type && styles.chipTextActive]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                {/* Marks & Total */}
                <View style={styles.row}>
                    <View style={styles.col}>
                        <Text style={styles.label}>Marks *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0"
                            keyboardType="numeric"
                            value={formData.marks}
                            onChangeText={(text) => handleChange({ marks: text })}
                        />
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.label}>Total *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="100"
                            keyboardType="numeric"
                            value={formData.total}
                            onChangeText={(text) => handleChange({ total: text })}
                        />
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.label}>Date *</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                            value={formData.examDate}
                            onChangeText={(text) => handleChange({ examDate: text })}
                        />
                    </View>
                </View>

                {/* Remarks */}
                <Text style={styles.label}>Remarks</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Optional remarks"
                    value={formData.remarks}
                    onChangeText={(text) => handleChange({ remarks: text })}
                    multiline
                    numberOfLines={2}
                />

                {/* Published Toggle */}
                <TouchableOpacity
                    style={[styles.toggleRow, formData.published && styles.toggleRowActive]}
                    onPress={() => handleChange({ published: !formData.published })}
                >
                    <View style={styles.toggleText}>
                        <Text style={styles.toggleLabel}>Publish Result</Text>
                        <Text style={styles.toggleSub}>Visible to student immediately</Text>
                    </View>
                    <MaterialCommunityIcons
                        name={formData.published ? "toggle-switch" : "toggle-switch-off-outline"}
                        size={36}
                        color={formData.published ? "#10B981" : "#9CA3AF"}
                    />
                </TouchableOpacity>
            </View>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    footer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#F1F5F9",
        alignItems: "center",
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#6B7280",
    },
    saveButton: {
        flex: 2,
        borderRadius: 12,
        overflow: "hidden",
    },
    saveButtonGradient: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 14,
    },
    saveButtonText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#FFFFFF",
    },
    formContent: {
        gap: 16,
        paddingBottom: 20
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 8,
        marginTop: 4,
    },
    input: {
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: "#1A1A1A",
    },
    textArea: {
        height: 80,
        textAlignVertical: "top",
    },
    chipContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    scrollChips: {
        marginBottom: 4,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: "#F1F5F9",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    chipActive: {
        backgroundColor: "#EEF2FF",
        borderColor: "#4C6EF5",
    },
    chipText: {
        fontSize: 13,
        fontWeight: "500",
        color: "#64748B",
    },
    chipTextActive: {
        color: "#4C6EF5",
        fontWeight: "600",
    },
    row: {
        flexDirection: "row",
        gap: 12,
    },
    col: {
        flex: 1,
        gap: 4,
    },
    toggleRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F8FAFC",
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginTop: 8,
    },
    toggleRowActive: {
        backgroundColor: "#ECFDF5",
        borderColor: "#10B981",
    },
    toggleText: {
        flex: 1,
    },
    toggleLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1E293B",
    },
    toggleSub: {
        fontSize: 12,
        color: "#64748B",
    }
});
