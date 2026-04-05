import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

export interface LibraryFormData {
    title: string;
    author: string;
    subject: string;
    type: "PDF" | "DOC" | "DOCX" | "PPT" | "PPTX" | "Book" | "eBook";
    fileUrl: string;
    availableCopies: string;
    totalCopies: string;
}

interface LibraryFormProps {
    initialData: LibraryFormData;
    onClose: () => void;
    onSave: (data: LibraryFormData) => void;
    isEditing: boolean;
}

const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science"];
const TYPES: LibraryFormData["type"][] = ["PDF", "DOC", "DOCX", "PPT", "PPTX", "Book", "eBook"];

export function LibraryForm({
    initialData,
    onClose,
    onSave,
    isEditing,
}: LibraryFormProps) {
    const [formData, setFormData] = React.useState<LibraryFormData>(initialData);

    const handleChange = (changes: Partial<LibraryFormData>) => {
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
                        {isEditing ? "Update" : "Add Book"}
                    </Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    return (
        <BottomSheet
            title={isEditing ? "Edit Book" : "Add New Book"}
            onClose={onClose}
            footer={footer}
            maxHeight={750}
        >
            <View style={styles.formContent}>
                {/* Title & Author */}
                <Text style={styles.label}>Title *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Book title"
                    placeholderTextColor="#9CA3AF"
                    value={formData.title}
                    onChangeText={(text) => handleChange({ title: text })}
                />

                <Text style={styles.label}>Author *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Author name"
                    placeholderTextColor="#9CA3AF"
                    value={formData.author}
                    onChangeText={(text) => handleChange({ author: text })}
                />

                {/* Subject Selector */}
                <Text style={styles.label}>Subject *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollChips}>
                    <View style={styles.chipContainer}>
                        {SUBJECTS.map((subj) => (
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

                {/* Type Selector */}
                <Text style={styles.label}>Type *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollChips}>
                    <View style={styles.chipContainer}>
                        {TYPES.map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[styles.chip, formData.type === type && styles.chipActive]}
                                onPress={() => handleChange({ type: type })}
                            >
                                <Text style={[styles.chipText, formData.type === type && styles.chipTextActive]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                {/* File URL */}
                <Text style={styles.label}>File URL (Optional)</Text>
                <View style={styles.inputContainer}>
                    <MaterialCommunityIcons name="link" size={20} color="#9CA3AF" style={styles.inputIcon} />
                    <TextInput
                        style={[styles.input, styles.inputWithIcon]}
                        placeholder="https://example.com/file.pdf"
                        placeholderTextColor="#9CA3AF"
                        value={formData.fileUrl}
                        onChangeText={(text) => handleChange({ fileUrl: text })}
                        autoCapitalize="none"
                    />
                </View>

                {/* Copies */}
                <View style={styles.row}>
                    <View style={styles.col}>
                        <Text style={styles.label}>Total Copies</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="1"
                            keyboardType="numeric"
                            value={formData.totalCopies}
                            onChangeText={(text) => handleChange({ totalCopies: text })}
                        />
                    </View>
                    <View style={styles.col}>
                        <Text style={styles.label}>Available</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="1"
                            keyboardType="numeric"
                            value={formData.availableCopies}
                            onChangeText={(text) => handleChange({ availableCopies: text })}
                        />
                    </View>
                </View>
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
    inputContainer: {
        position: 'relative',
    },
    inputIcon: {
        position: 'absolute',
        left: 16,
        top: 14,
        zIndex: 1,
    },
    inputWithIcon: {
        paddingLeft: 44,
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
});
