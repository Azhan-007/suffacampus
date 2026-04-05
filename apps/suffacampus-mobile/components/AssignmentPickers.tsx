import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheet } from './BottomSheet';

const DEFAULT_SUBJECTS = [
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

const DEFAULT_CLASSES = [
    "6A", "6B", "6C",
    "7A", "7B", "7C",
    "8A", "8B", "8C",
    "9A", "9B", "9C",
    "10A", "10B", "10C",
    "11A", "11B", "11C",
    "12A", "12B", "12C",
];

const PRIORITIES = [
    { label: "High", value: "High", color: "#EF4444", bgColor: "#FEE2E2" },
    { label: "Medium", value: "Medium", color: "#F59E0B", bgColor: "#FEF3C7" },
    { label: "Low", value: "Low", color: "#10B981", bgColor: "#D1FAE5" },
];

interface SubjectPickerProps {
    selectedSubject: string;
    onSelect: (subject: string) => void;
    onClose: () => void;
    subjects?: { name: string; icon: string; color: string }[];
}

export function SubjectPicker({ selectedSubject, onSelect, onClose, subjects }: SubjectPickerProps) {
    const subjectList = subjects && subjects.length > 0 ? subjects : DEFAULT_SUBJECTS;
    return (
        <BottomSheet title="Select Subject" onClose={onClose} maxHeight={600}>
            <ScrollView style={styles.pickerContent}>
                {subjectList.map((subject) => (
                    <TouchableOpacity
                        key={subject.name}
                        style={[
                            styles.pickerItem,
                            selectedSubject === subject.name && styles.pickerItemSelected,
                        ]}
                        onPress={() => {
                            onSelect(subject.name);
                            onClose();
                        }}
                    >
                        <View style={[styles.pickerItemIcon, { backgroundColor: `${subject.color}15` }]}>
                            <MaterialCommunityIcons name={subject.icon as any} size={22} color={subject.color} />
                        </View>
                        <Text style={styles.pickerItemText}>{subject.name}</Text>
                        {selectedSubject === subject.name && (
                            <MaterialCommunityIcons name="check-circle" size={22} color="#4C6EF5" />
                        )}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </BottomSheet>
    );
}

interface ClassPickerProps {
    selectedClass: string;
    onSelect: (cls: string) => void;
    onClose: () => void;
    classes?: string[];
}

export function ClassPicker({ selectedClass, onSelect, onClose, classes }: ClassPickerProps) {
    const classList = classes && classes.length > 0 ? classes : DEFAULT_CLASSES;
    return (
        <BottomSheet title="Select Class" onClose={onClose} maxHeight={600}>
            <View style={styles.classGrid}>
                {classList.map((cls) => (
                    <TouchableOpacity
                        key={cls}
                        style={[
                            styles.classGridItem,
                            selectedClass === cls && styles.classGridItemSelected,
                        ]}
                        onPress={() => {
                            onSelect(cls);
                            onClose();
                        }}
                    >
                        <Text
                            style={[
                                styles.classGridItemText,
                                selectedClass === cls && styles.classGridItemTextSelected,
                            ]}
                        >
                            {cls}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </BottomSheet>
    );
}

interface DatePickerProps {
    selectedDate: string;
    onSelect: (date: string) => void;
    onClose: () => void;
}

export function DatePicker({ selectedDate, onSelect, onClose }: DatePickerProps) {
    const generateDateOptions = () => {
        const dates: Date[] = [];
        const today = new Date();
        for (let i = 0; i < 60; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            dates.push(date);
        }
        return dates;
    };

    const getDateLabel = (date: Date) => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const dateStr = date.toISOString().split("T")[0];
        const todayStr = today.toISOString().split("T")[0];
        const tomorrowStr = tomorrow.toISOString().split("T")[0];

        if (dateStr === todayStr) return "Today";
        if (dateStr === tomorrowStr) return "Tomorrow";

        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
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

    return (
        <BottomSheet title="Select Due Date" onClose={onClose} maxHeight={600}>
            <ScrollView style={styles.pickerContent}>
                {generateDateOptions().map((date, index) => {
                    const dateStr = date.toISOString().split("T")[0];
                    const isSelected = selectedDate === dateStr;
                    return (
                        <TouchableOpacity
                            key={index}
                            style={[styles.dateItem, isSelected && styles.dateItemSelected]}
                            onPress={() => {
                                onSelect(dateStr);
                                onClose();
                            }}
                        >
                            <View style={styles.dateItemContent}>
                                <Text style={[styles.dateItemDay, isSelected && styles.dateItemDaySelected]}>
                                    {getDateLabel(date)}
                                </Text>
                                <Text style={[styles.dateItemDate, isSelected && styles.dateItemDateSelected]}>
                                    {formatDate(dateStr)}
                                </Text>
                            </View>
                            {isSelected && (
                                <MaterialCommunityIcons name="check-circle" size={22} color="#4C6EF5" />
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    pickerContent: {
        marginBottom: 20,
    },
    pickerItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    pickerItemSelected: {
        backgroundColor: "#EEF2FF",
        marginHorizontal: -20,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderBottomWidth: 0,
    },
    pickerItemIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    pickerItemText: {
        flex: 1,
        fontSize: 15,
        fontWeight: "500",
        color: "#1A1A1A",
    },
    classGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        paddingBottom: 20,
    },
    classGridItem: {
        width: "22%",
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: "#F8FAFC",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        alignItems: "center",
    },
    classGridItemSelected: {
        backgroundColor: "#4C6EF5",
        borderColor: "#4C6EF5",
    },
    classGridItemText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#374151",
    },
    classGridItemTextSelected: {
        color: "#FFFFFF",
    },
    dateItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: "#F1F5F9",
    },
    dateItemSelected: {
        backgroundColor: "#EEF2FF",
        marginHorizontal: -20,
        paddingHorizontal: 24,
        borderRadius: 12,
        borderBottomWidth: 0,
    },
    dateItemContent: {
        flex: 1,
    },
    dateItemDay: {
        fontSize: 15,
        fontWeight: "600",
        color: "#1A1A1A",
    },
    dateItemDaySelected: {
        color: "#4C6EF5",
    },
    dateItemDate: {
        fontSize: 13,
        color: "#6B7280",
        marginTop: 2,
    },
    dateItemDateSelected: {
        color: "#4C6EF5",
    },
});
