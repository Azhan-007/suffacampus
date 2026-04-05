import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

interface ScheduleFormData {
    subject: string;
    class: string;
    day: string;
    startTime: string;
    endTime: string;
    room: string;
}

interface ScheduleFormProps {
    initialData: ScheduleFormData;
    onClose: () => void;
    onSave: (data: ScheduleFormData) => void;
    loading?: boolean;
    isEditing: boolean;
}

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ScheduleForm({
    initialData,
    onClose,
    onSave,
    loading = false,
    isEditing,
}: ScheduleFormProps) {
    const [formData, setFormData] = React.useState<ScheduleFormData>(initialData);

    const handleChange = (changes: Partial<ScheduleFormData>) => {
        setFormData(prev => ({ ...prev, ...changes }));
    };

    const footer = (
        <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(formData)} style={styles.saveButton} disabled={loading}>
                {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                    <Text style={styles.saveButtonText}>{isEditing ? "Update" : "Add"}</Text>
                )}
            </TouchableOpacity>
        </View>
    );

    return (
        <BottomSheet
            title={isEditing ? "Edit Schedule" : "Add Schedule"}
            onClose={onClose}
            footer={footer}
            maxHeight={650}
        >
            <View style={styles.formContent}>
                <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Subject *</Text>
                    <TextInput
                        style={styles.formInput}
                        value={formData.subject}
                        onChangeText={(text) => handleChange({ subject: text })}
                        placeholder="Mathematics"
                        placeholderTextColor="#94A3B8"
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Class *</Text>
                    <TextInput
                        style={styles.formInput}
                        value={formData.class}
                        onChangeText={(text) => handleChange({ class: text })}
                        placeholder="Class 10A"
                        placeholderTextColor="#94A3B8"
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Day</Text>
                    <View style={styles.daySelectGrid}>
                        {DAYS_OF_WEEK.map((day) => (
                            <TouchableOpacity
                                key={day}
                                style={[styles.daySelectChip, formData.day === day && styles.daySelectChipActive]}
                                onPress={() => handleChange({ day })}
                            >
                                <Text style={[styles.daySelectText, formData.day === day && styles.daySelectTextActive]}>
                                    {day.substring(0, 3)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.formRow}>
                    <View style={styles.formGroupHalf}>
                        <Text style={styles.formLabel}>Start Time</Text>
                        <View style={styles.pickerContainer}>
                            <MaterialCommunityIcons name="clock-outline" size={20} color="#64748B" />
                            <TextInput
                                style={styles.pickerInput}
                                value={formData.startTime}
                                onChangeText={(text) => handleChange({ startTime: text })}
                                placeholder="08:00"
                                placeholderTextColor="#94A3B8"
                            />
                        </View>
                    </View>

                    <View style={styles.formGroupHalf}>
                        <Text style={styles.formLabel}>End Time</Text>
                        <View style={styles.pickerContainer}>
                            <MaterialCommunityIcons name="clock-outline" size={20} color="#64748B" />
                            <TextInput
                                style={styles.pickerInput}
                                value={formData.endTime}
                                onChangeText={(text) => handleChange({ endTime: text })}
                                placeholder="09:00"
                                placeholderTextColor="#94A3B8"
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Room *</Text>
                    <TextInput
                        style={styles.formInput}
                        value={formData.room}
                        onChangeText={(text) => handleChange({ room: text })}
                        placeholder="Room 201"
                        placeholderTextColor="#94A3B8"
                    />
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
        fontSize: 16,
        fontWeight: "600",
        color: "#64748B",
    },
    saveButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#4C6EF5",
        alignItems: "center",
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#FFFFFF",
    },
    formContent: {
        paddingBottom: 20
    },
    formGroup: {
        marginBottom: 20,
    },
    formLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: "#475569",
        marginBottom: 8,
    },
    formInput: {
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: "#1E293B",
    },
    daySelectGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    daySelectChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E2E8F0",
    },
    daySelectChipActive: {
        backgroundColor: "#4C6EF5",
        borderColor: "#4C6EF5",
    },
    daySelectText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#64748B",
    },
    daySelectTextActive: {
        color: "#FFFFFF",
    },
    formRow: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 20,
    },
    formGroupHalf: {
        flex: 1,
    },
    pickerContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        borderRadius: 12,
        paddingHorizontal: 16,
    },
    pickerInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 15,
        color: "#1E293B",
    },
});
