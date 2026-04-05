import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createEvent, deleteEvent, Event, getEvents, updateEvent } from "../../services/eventsService";

const iconOptions = [
  { name: "calendar", label: "Calendar" },
  { name: "bullhorn", label: "Announcement" },
  { name: "trophy", label: "Trophy" },
  { name: "school", label: "School" },
  { name: "account-group", label: "Group" },
  { name: "book-open-variant", label: "Book" },
  { name: "star", label: "Star" },
  { name: "flag", label: "Flag" },
];

const colorOptions = [
  "#4C6EF5", "#10B981", "#F59E0B", "#EF4444", 
  "#8B5CF6", "#EC4899", "#06B6D4", "#6366F1"
];

export default function AdminEventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "past">("all");

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("calendar");
  const [selectedColor, setSelectedColor] = useState("#4C6EF5");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, [filterStatus]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const isActive = filterStatus === "active" ? true : filterStatus === "past" ? false : undefined;
      const eventsList = await getEvents({ isActive });
      setEvents(eventsList);
    } catch (error: any) {
      console.warn("Error fetching events:", error?.message || error);
      Alert.alert("Error", "Failed to load events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    resetForm();
    setEditingEvent(null);
    setModalVisible(true);
  };

  const openEditModal = (event: Event) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description);
    setDate(event.date);
    setStartDate(event.startDate);
    setEndDate(event.endDate || "");
    setLocation(event.location || "");
    setSelectedIcon(event.icon);
    setSelectedColor(event.color);
    setIsActive(event.isActive);
    setModalVisible(true);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setDate("");
    setStartDate("");
    setEndDate("");
    setLocation("");
    setSelectedIcon("calendar");
    setSelectedColor("#4C6EF5");
    setIsActive(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !date.trim() || !startDate.trim()) {
      Alert.alert("Error", "Please fill in all required fields (Title, Date, Start Date)");
      return;
    }

    try {
      const eventData = {
        title: title.trim(),
        description: description.trim(),
        date: date.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim() || undefined,
        location: location.trim() || undefined,
        icon: selectedIcon,
        color: selectedColor,
        isActive,
      };

      if (editingEvent) {
        await updateEvent(editingEvent.id, eventData);
        Alert.alert("Success", "Event updated successfully!");
      } else {
        await createEvent(eventData);
        Alert.alert("Success", "Event added successfully!");
      }

      setModalVisible(false);
      fetchEvents();
    } catch (error: any) {
      console.warn("Error saving event:", error);
      if (error?.code === 'permission-denied') {
        Alert.alert("Permission Error", "You don't have permission to modify events. Please check Firebase rules.");
      } else {
        Alert.alert("Error", "Failed to save event. Please try again.");
      }
    }
  };

  const handleDelete = (event: Event) => {
    Alert.alert(
      "Delete Event",
      `Are you sure you want to delete "${event.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteEvent(event.id);
              Alert.alert("Success", "Event deleted successfully!");
              fetchEvents();
            } catch (error: any) {
              console.warn("Error deleting event:", error);
              if (error?.code === 'permission-denied') {
                Alert.alert("Permission Error", "You don't have permission to delete events.");
              } else {
                Alert.alert("Error", "Failed to delete event. Please try again.");
              }
            }
          },
        },
      ]
    );
  };

  const getFilteredEvents = () => {
    if (filterStatus === "all") return events;
    if (filterStatus === "active") return events.filter(e => e.isActive);
    return events.filter(e => !e.isActive);
  };

  const filteredEvents = getFilteredEvents();

  return (
    <>
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Events</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === "all" && styles.filterTabActive]}
          onPress={() => setFilterStatus("all")}
        >
          <Text style={[styles.filterText, filterStatus === "all" && styles.filterTextActive]}>
            All ({events.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === "active" && styles.filterTabActive]}
          onPress={() => setFilterStatus("active")}
        >
          <Text style={[styles.filterText, filterStatus === "active" && styles.filterTextActive]}>
            Active ({events.filter(e => e.isActive).length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterStatus === "past" && styles.filterTabActive]}
          onPress={() => setFilterStatus("past")}
        >
          <Text style={[styles.filterText, filterStatus === "past" && styles.filterTextActive]}>
            Past ({events.filter(e => !e.isActive).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Events List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading events...</Text>
          </View>
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="calendar-blank" size={64} color="#CBD5E1" />
            <Text style={styles.emptyText}>No events found</Text>
            <Text style={styles.emptySubtext}>Tap + to add a new event</Text>
          </View>
        ) : (
          filteredEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => openEditModal(event)}
              activeOpacity={0.7}
            >
              <View style={styles.eventCardContent}>
                <View style={[styles.eventIconCircle, { backgroundColor: `${event.color}15` }]}>
                  <MaterialCommunityIcons name={event.icon as any} size={28} color={event.color} />
                </View>
                <View style={styles.eventDetails}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle}>{event.title}</Text>
                    {!event.isActive && (
                      <View style={styles.pastBadge}>
                        <Text style={styles.pastBadgeText}>Past</Text>
                      </View>
                    )}
                  </View>
                  {event.description && (
                    <Text style={styles.eventDescription} numberOfLines={2}>{event.description}</Text>
                  )}
                  <View style={styles.eventMetaRow}>
                    <MaterialCommunityIcons name="calendar-outline" size={14} color="#64748B" />
                    <Text style={styles.eventDate}>{event.date}</Text>
                    {event.location && (
                      <>
                        <Text style={styles.eventMetaDot}>•</Text>
                        <MaterialCommunityIcons name="map-marker" size={14} color="#64748B" />
                        <Text style={styles.eventLocation}>{event.location}</Text>
                      </>
                    )}
                  </View>
                </View>
                <View style={styles.eventActions}>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDelete(event);
                    }}
                    style={styles.deleteButton}
                  >
                    <MaterialCommunityIcons name="delete-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingEvent ? "Edit Event" : "Add Event"}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Title */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Event title"
                  value={title}
                  onChangeText={setTitle}
                />
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Event description"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Date Display */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Display Date *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Jan 25 or Jan 25-27"
                  value={date}
                  onChangeText={setDate}
                />
              </View>

              {/* Start Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Start Date * (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-01-25"
                  value={startDate}
                  onChangeText={setStartDate}
                />
              </View>

              {/* End Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>End Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-01-27 (optional)"
                  value={endDate}
                  onChangeText={setEndDate}
                />
              </View>

              {/* Location */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Event location"
                  value={location}
                  onChangeText={setLocation}
                />
              </View>

              {/* Icon Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Icon</Text>
                <View style={styles.iconGrid}>
                  {iconOptions.map((icon) => (
                    <TouchableOpacity
                      key={icon.name}
                      style={[
                        styles.iconOption,
                        selectedIcon === icon.name && styles.iconOptionSelected,
                      ]}
                      onPress={() => setSelectedIcon(icon.name)}
                    >
                      <MaterialCommunityIcons
                        name={icon.name as any}
                        size={24}
                        color={selectedIcon === icon.name ? "#4C6EF5" : "#64748B"}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Color Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Color</Text>
                <View style={styles.colorGrid}>
                  {colorOptions.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => setSelectedColor(color)}
                    >
                      {selectedColor === color && (
                        <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Status Toggle */}
              <View style={styles.inputGroup}>
                <View style={styles.toggleRow}>
                  <View>
                    <Text style={styles.inputLabel}>Active Status</Text>
                    <Text style={styles.toggleSubtext}>Show this event on dashboard</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.toggleButton, isActive && styles.toggleButtonActive]}
                    onPress={() => setIsActive(!isActive)}
                  >
                    <View style={[styles.toggleThumb, isActive && styles.toggleThumbActive]} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={handleSave}>
                  <LinearGradient colors={["#4C6EF5", "#6B8AFF"]} style={styles.saveButtonGradient}>
                    <Text style={styles.saveButtonText}>{editingEvent ? "Update" : "Add"} Event</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1E293B", flex: 1, textAlign: "center", marginHorizontal: 16 },
  addButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#4C6EF5", alignItems: "center", justifyContent: "center" },
  filterContainer: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, backgroundColor: "#FFFFFF", gap: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  filterTab: { flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center" },
  filterTabActive: { backgroundColor: "#4C6EF5" },
  filterText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  filterTextActive: { color: "#FFFFFF" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 80 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#64748B", marginTop: 16 },
  emptySubtext: { fontSize: 14, color: "#94A3B8", marginTop: 8 },
  eventCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  eventCardContent: { flexDirection: "row", alignItems: "flex-start" },
  eventIconCircle: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 12 },
  eventDetails: { flex: 1 },
  eventHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  eventTitle: { fontSize: 16, fontWeight: "700", color: "#1E293B", flex: 1 },
  pastBadge: { backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  pastBadgeText: { fontSize: 11, fontWeight: "600", color: "#64748B" },
  eventDescription: { fontSize: 14, color: "#64748B", marginBottom: 8, lineHeight: 20 },
  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  eventDate: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  eventMetaDot: { fontSize: 10, color: "#CBD5E1", marginHorizontal: 4 },
  eventLocation: { fontSize: 13, color: "#64748B" },
  eventActions: { marginLeft: 8 },
  deleteButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center" },
  modalOverlay: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)", 
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 50,
  },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 32, maxHeight: "90%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#1E293B" },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: "600", color: "#1E293B", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: "#1E293B", backgroundColor: "#F8FAFC" },
  textArea: { height: 80, textAlignVertical: "top" },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconOption: { width: 50, height: 50, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent" },
  iconOptionSelected: { borderColor: "#4C6EF5", backgroundColor: "#EEF2FF" },
  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  colorOption: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "transparent" },
  colorOptionSelected: { borderColor: "#FFFFFF", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleSubtext: { fontSize: 12, color: "#64748B", marginTop: 2 },
  toggleButton: { width: 56, height: 32, borderRadius: 16, backgroundColor: "#CBD5E1", padding: 2, justifyContent: "center" },
  toggleButtonActive: { backgroundColor: "#10B981" },
  toggleThumb: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#FFFFFF" },
  toggleThumbActive: { alignSelf: "flex-end" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalButton: { flex: 1, borderRadius: 12, overflow: "hidden" },
  cancelButton: { backgroundColor: "#F1F5F9" },
  cancelButtonText: { fontSize: 16, fontWeight: "600", color: "#64748B", textAlign: "center", paddingVertical: 14 },
  saveButton: {},
  saveButtonGradient: { paddingVertical: 14, alignItems: "center" },
  saveButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});

