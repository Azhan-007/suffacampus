import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ClassPicker, DatePicker, SubjectPicker } from './AssignmentPickers';
import { BottomSheet } from './BottomSheet';
import { useModalPortal } from './ModalPortal';

export interface AssignmentFormData {
    subject: string;
    title: string;
    description: string;
    dueDate: string;
    class: string;
    priority: 'High' | 'Medium' | 'Low';
    totalMarks: string;
    status: 'active' | 'draft' | 'closed';
}

interface CreateAssignmentFormProps {
    initialData: AssignmentFormData;
    onClose: () => void;
    onSave: (data: AssignmentFormData) => void;
    isEditing: boolean;
}

const PRIORITIES = [
    { label: "High", value: "High", color: "#EF4444", bgColor: "#FEE2E2" },
    { label: "Medium", value: "Medium", color: "#F59E0B", bgColor: "#FEF3C7" },
    { label: "Low", value: "Low", color: "#10B981", bgColor: "#D1FAE5" },
];

const SUBJECTS = [
    { name: "Mathematics", icon: "calculator-variant", color: "#4C6EF5" },
    { name: "Physics", icon: "atom", color: "#9C27B0" },
    { name: "Chemistry", icon: "flask", color: "#4CAF50" },
    { name: "Biology", icon: "leaf", color: "#FF5722" },
    { name: "English", icon: "book-open-variant", color: "#FF9800" },
    { name: "Hindi", icon: "translate", color: "#E91E63" },
    { name: "History", icon: "pillar", color: "#795548" },
    { name: "Geography", icon: "earth", color: "#009688" },
    { name: "Computer Science", icon: "laptop", color: "#3F51B5" },
    { name: "Physical Education", icon: "run", color: "#FFC107" },
];

export function CreateAssignmentForm({
    initialData,
    onClose,
    onSave,
    isEditing,
}: CreateAssignmentFormProps) {
    const { showModal, hideModal } = useModalPortal();
    const [formData, setFormData] = useState<AssignmentFormData>(initialData);

    const handleChange = (changes: Partial<AssignmentFormData>) => {
        setFormData(prev => ({ ...prev, ...changes }));
    };

    const getSubjectIcon = (subjectName: string) => {
        const subject = SUBJECTS.find((s) => s.name === subjectName);
        return subject?.icon || "book";
    };

    const getSubjectColor = (subjectName: string) => {
        const subject = SUBJECTS.find((s) => s.name === subjectName);
        return subject?.color || "#4C6EF5";
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

    const handleOpenSubjectPicker = () => {
        const modalId = showModal(
            <SubjectPicker
                selectedSubject={formData.subject}
                onSelect={(subject) => {
                    handleChange({ subject });
                    hideModal(modalId);
                }}
                onClose={() => hideModal(modalId)}
            />
        );
    };

    const handleOpenClassPicker = () => {
        const modalId = showModal(
            <ClassPicker
                selectedClass={formData.class}
                onSelect={(cls) => {
                    handleChange({ class: cls });
                    hideModal(modalId);
                }}
                onClose={() => hideModal(modalId)}
            />
        );
    };

    const handleOpenDatePicker = () => {
        const modalId = showModal(
            <DatePicker
                selectedDate={formData.dueDate}
                onSelect={(date) => {
                    handleChange({ dueDate: date });
                    hideModal(modalId);
                }}
                onClose={() => hideModal(modalId)}
            />
        );
    };

    const handleSave = () => {
        // Basic validation
        if (!formData.subject.trim()) {
            Alert.alert("Missing Field", "Please select a subject");
            return;
        }
        if (!formData.class.trim()) {
            Alert.alert("Missing Field", "Please select a class");
            return;
        }
        if (!formData.title.trim()) {
            Alert.alert("Missing Field", "Please enter a title");
            return;
        }
        if (!formData.description.trim()) {
            Alert.alert("Missing Field", "Please enter a description");
            return;
        }
        if (!formData.dueDate) {
            Alert.alert("Missing Field", "Please select a due date");
            return;
        }

        onSave(formData);
    };

    const footer = (
        <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
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
                        {isEditing ? "Update" : "Create"}
                    </Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    return (
        <BottomSheet
            title={isEditing ? "Edit Assignment" : "Create Assignment"}
            onClose={onClose}
            footer={footer}
            maxHeight={700}
        >
            {/* Subject Selector */}
            <Text style={styles.label}>Subject *</Text>
            <TouchableOpacity style={styles.pickerButton} onPress={handleOpenSubjectPicker}>
                <View style={styles.pickerContent}>
                    {formData.subject ? (
                        <>
                            <View
                                style={[
                                    styles.pickerIcon,
                                    { backgroundColor: `${getSubjectColor(formData.subject)}15` },
                                ]}
                            >
                                <MaterialCommunityIcons
                                    name={getSubjectIcon(formData.subject) as any}
                                    size={18}
                                    color={getSubjectColor(formData.subject)}
                                />
                            </View>
                            <Text style={styles.pickerText}>{formData.subject}</Text>
                        </>
                    ) : (
                        <Text style={styles.pickerPlaceholder}>Select subject</Text>
                    )}
                </View>
                <MaterialCommunityIcons name="chevron-down" size={24} color="#6B7280" />
            </TouchableOpacity>

            {/* Class Selector */}
            <Text style={styles.label}>Class *</Text>
            <TouchableOpacity style={styles.pickerButton} onPress={handleOpenClassPicker}>
                <View style={styles.pickerContent}>
                    {formData.class ? (
                        <>
                            <View style={[styles.pickerIcon, { backgroundColor: "#EEF2FF" }]}>
                                <MaterialIcons name="class" size={18} color="#4C6EF5" />
                            </View>
                            <Text style={styles.pickerText}>{formData.class}</Text>
                        </>
                    ) : (
                        <Text style={styles.pickerPlaceholder}>Select class</Text>
                    )}
                </View>
                <MaterialCommunityIcons name="chevron-down" size={24} color="#6B7280" />
            </TouchableOpacity>

            {/* Title Input */}
            <Text style={styles.label}>Title *</Text>
            <TextInput
                style={styles.textInput}
                placeholder="Enter assignment title"
                placeholderTextColor="#9CA3AF"
                value={formData.title}
                onChangeText={(text) => handleChange({ title: text })}
            />

            {/* Description Input */}
            <Text style={styles.label}>Description *</Text>
            <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                placeholder="Enter assignment description and instructions"
                placeholderTextColor="#9CA3AF"
                value={formData.description}
                onChangeText={(text) => handleChange({ description: text })}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
            />

            {/* Due Date Selector */}
            <Text style={styles.label}>Due Date *</Text>
            <TouchableOpacity style={styles.pickerButton} onPress={handleOpenDatePicker}>
                <View style={styles.pickerContent}>
                    {formData.dueDate ? (
                        <>
                            <View style={[styles.pickerIcon, { backgroundColor: "#FEF3C7" }]}>
                                <MaterialCommunityIcons name="calendar" size={18} color="#F59E0B" />
                            </View>
                            <Text style={styles.pickerText}>{formatDate(formData.dueDate)}</Text>
                        </>
                    ) : (
                        <Text style={styles.pickerPlaceholder}>Select due date</Text>
                    )}
                </View>
                <MaterialCommunityIcons name="chevron-down" size={24} color="#6B7280" />
            </TouchableOpacity>

            {/* Priority Selector */}
            <Text style={styles.label}>Priority</Text>
            <View style={styles.prioritySelector}>
                {PRIORITIES.map((p) => (
                    <TouchableOpacity
                        key={p.value}
                        style={[
                            styles.priorityOption,
                            formData.priority === p.value && {
                                backgroundColor: p.bgColor,
                                borderColor: p.color,
                            },
                        ]}
                        onPress={() => handleChange({ priority: p.value as any })}
                    >
                        <View style={[styles.priorityDot, { backgroundColor: p.color }]} />
                        <Text
                            style={[
                                styles.priorityOptionText,
                                formData.priority === p.value && { color: p.color, fontWeight: "600" },
                            ]}
                        >
                            {p.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Total Marks Input */}
            <Text style={styles.label}>Total Marks</Text>
            <TextInput
                style={styles.textInput}
                placeholder="100"
                placeholderTextColor="#9CA3AF"
                value={formData.totalMarks}
                onChangeText={(text) => handleChange({ totalMarks: text.replace(/[^0-9]/g, "") })}
                keyboardType="number-pad"
            />

            {/* Status Selector */}
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusSelector}>
                {[
                    { value: "active", label: "Active (Visible to students)", color: "#10B981" },
                    { value: "draft", label: "Draft (Hidden)", color: "#F59E0B" },
                ].map((status) => (
                    <TouchableOpacity
                        key={status.value}
                        style={[
                            styles.statusOption,
                            formData.status === status.value && {
                                backgroundColor: `${status.color}15`,
                                borderColor: status.color,
                            },
                        ]}
                        onPress={() => handleChange({ status: status.value as any })}
                    >
                        <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                        <Text
                            style={[
                                styles.statusOptionText,
                                formData.status === status.value && { color: status.color, fontWeight: "600" },
                            ]}
                        >
                            {status.label}
                        </Text>
                    </TouchableOpacity>
                ))}
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
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
        marginBottom: 8,
        marginTop: 16,
    },
    textInput: {
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: "#1A1A1A",
    },
    textAreaInput: {
        height: 100,
        paddingTop: 14,
    },
    pickerButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    pickerContent: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
    },
    pickerIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    pickerText: {
        fontSize: 15,
        fontWeight: "500",
        color: "#1A1A1A",
    },
    pickerPlaceholder: {
        fontSize: 15,
        color: "#9CA3AF",
    },
    prioritySelector: {
        flexDirection: "row",
        gap: 8,
    },
    priorityOption: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#F8FAFC",
    },
    priorityDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    priorityOptionText: {
        fontSize: 13,
        fontWeight: "500",
        color: "#6B7280",
    },
    statusSelector: {
        gap: 8,
    },
    statusOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#F8FAFC",
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    statusOptionText: {
        fontSize: 14,
        fontWeight: "500",
        color: "#6B7280",
    },
});
