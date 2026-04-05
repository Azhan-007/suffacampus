import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Event, getEvents } from "../../services/eventsService";

export default function EventsScreen() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "past">("all");

  useEffect(() => {
    fetchEvents();
  }, [filterStatus]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const isActive = filterStatus === "active" ? true : filterStatus === "past" ? false : undefined;
      const eventsList = await getEvents({ isActive });
      setEvents(eventsList);
    } catch (err) {
      console.warn("Error fetching events:", err);
      Alert.alert("Error", "Failed to load events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const openEventDetails = (event: Event) => {
    setSelectedEvent(event);
    setDetailsModalVisible(true);
  };

  const getFilteredEvents = () => {
    if (filterStatus === "all") return events;
    if (filterStatus === "active") return events.filter(e => e.isActive);
    return events.filter(e => !e.isActive);
  };

  const filteredEvents = getFilteredEvents();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Events & News</Text>
        <View style={styles.placeholder} />
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
            <Text style={styles.emptySubtext}>Check back later for updates</Text>
          </View>
        ) : (
          filteredEvents.map((event) => (
            <TouchableOpacity
              key={event.id}
              style={styles.eventCard}
              onPress={() => openEventDetails(event)}
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
                <MaterialCommunityIcons name="chevron-right" size={24} color="#CBD5E1" />
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Event Details Modal */}
      <Modal visible={detailsModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconCircle, { backgroundColor: `${selectedEvent?.color}15` }]}>
                <MaterialCommunityIcons 
                  name={selectedEvent?.icon as any} 
                  size={32} 
                  color={selectedEvent?.color} 
                />
              </View>
              <TouchableOpacity 
                onPress={() => setDetailsModalVisible(false)}
                style={styles.closeButton}
              >
                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <View style={styles.modalTitleRow}>
                <Text style={styles.modalTitle}>{selectedEvent?.title}</Text>
                {!selectedEvent?.isActive && (
                  <View style={styles.pastBadgeLarge}>
                    <Text style={styles.pastBadgeTextLarge}>Past Event</Text>
                  </View>
                )}
              </View>

              {/* Date & Location */}
              <View style={styles.detailsSection}>
                <View style={styles.detailRow}>
                  <View style={styles.detailIconWrapper}>
                    <MaterialCommunityIcons name="calendar" size={20} color="#4C6EF5" />
                  </View>
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{selectedEvent?.date}</Text>
                  </View>
                </View>

                {selectedEvent?.location && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrapper}>
                      <MaterialCommunityIcons name="map-marker" size={20} color="#10B981" />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Location</Text>
                      <Text style={styles.detailValue}>{selectedEvent.location}</Text>
                    </View>
                  </View>
                )}

                {selectedEvent?.endDate && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailIconWrapper}>
                      <MaterialCommunityIcons name="clock-outline" size={20} color="#F59E0B" />
                    </View>
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Duration</Text>
                      <Text style={styles.detailValue}>
                        {selectedEvent.startDate} to {selectedEvent.endDate}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Description */}
              {selectedEvent?.description && (
                <View style={styles.descriptionSection}>
                  <Text style={styles.descriptionLabel}>Description</Text>
                  <Text style={styles.descriptionText}>{selectedEvent.description}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1E293B", flex: 1, textAlign: "center", marginHorizontal: 16 },
  placeholder: { width: 40 },
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 32, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalIconCircle: { width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  closeButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" },
  modalScroll: { flex: 1 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  modalTitle: { fontSize: 24, fontWeight: "700", color: "#1E293B", flex: 1 },
  pastBadgeLarge: { backgroundColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginLeft: 12 },
  pastBadgeTextLarge: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  detailsSection: { marginBottom: 24 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: "#F8FAFC", borderRadius: 12 },
  detailIconWrapper: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 4 },
  detailValue: { fontSize: 15, fontWeight: "600", color: "#1E293B" },
  descriptionSection: { paddingTop: 20, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  descriptionLabel: { fontSize: 16, fontWeight: "700", color: "#1E293B", marginBottom: 12 },
  descriptionText: { fontSize: 15, color: "#64748B", lineHeight: 24 },
});
