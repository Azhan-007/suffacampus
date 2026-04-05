import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { getLibraryItems, type LibraryItem } from "../../services/libraryService";

export default function LibraryScreen() {
  const [materials, setMaterials] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const items = await getLibraryItems();
      setMaterials(items);
    } catch (error) {
      console.warn("Error fetching library materials:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = async (item: LibraryItem) => {
    if (!item.fileUrl) {
      Alert.alert("Info", item.type === "Book" ? "Please visit the library to borrow this book" : "File not available");
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(item.fileUrl);
      if (canOpen) {
        await Linking.openURL(item.fileUrl);
      } else {
        Alert.alert("Error", "Cannot open this file");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to open file");
    }
  };

  const getSubjectColor = (subject: string) => {
    const colors: { [key: string]: string } = {
      Mathematics: "#4C6EF5",
      Physics: "#10B981",
      Chemistry: "#EC4899",
      Biology: "#14B8A6",
      English: "#F59E0B",
      "Computer Science": "#8B5CF6",
    };
    return colors[subject] || "#6B7280";
  };

  const getTypeIcon = (type: string) => {
    const icons: { [key: string]: string } = {
      PDF: "file-pdf-box",
      DOC: "file-word-box",
      DOCX: "file-word-box",
      PPT: "file-powerpoint-box",
      PPTX: "file-powerpoint-box",
      Book: "book",
      eBook: "book-open-variant",
    };
    return icons[type] || "file-document";
  };

  const filteredMaterials = materials.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Library</Text>
          <Text style={styles.headerSubtitle}>{materials.length} items</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search books..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={20} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
        </View>
      ) : filteredMaterials.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="bookshelf" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>No materials found</Text>
          <Text style={styles.emptyText}>
            {searchQuery ? "Try a different search" : "Check back later"}
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          {filteredMaterials.map((item) => {
            const subjectColor = getSubjectColor(item.subject);
            const isAvailable = (item.availableCopies || 0) > 0;

            return (
              <TouchableOpacity key={item.id} onPress={() => handleOpenFile(item)}>
                <Card style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: subjectColor + "15" }]}>
                      <MaterialCommunityIcons
                        name={getTypeIcon(item.type) as any}
                        size={28}
                        color={subjectColor}
                      />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardAuthor}>{item.author}</Text>
                      <View style={styles.cardMeta}>
                        <Text style={[styles.subjectTag, { color: subjectColor }]}>
                          {item.subject}
                        </Text>
                        <Text style={styles.cardType}>{item.type}</Text>
                      </View>
                    </View>
                  </View>

                  {item.totalCopies && (
                    <View style={styles.availabilityRow}>
                      <MaterialCommunityIcons
                        name={isAvailable ? "check-circle" : "close-circle"}
                        size={16}
                        color={isAvailable ? "#10B981" : "#EF4444"}
                      />
                      <Text style={[styles.availabilityText, { color: isAvailable ? "#10B981" : "#EF4444" }]}>
                        {isAvailable ? item.availableCopies + " available" : "Not available"}
                      </Text>
                    </View>
                  )}

                  <View style={styles.actionButton}>
                    <MaterialCommunityIcons
                      name={item.type === "Book" ? "hand-extended" : "download"}
                      size={18}
                      color="#4C6EF5"
                    />
                    <Text style={styles.actionButtonText}>
                      {item.type === "Book" ? "Borrow" : "Download"}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
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
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 6,
  },
  listContainer: {
    gap: 12,
  },
  card: {
    gap: 12,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  cardAuthor: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subjectTag: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardType: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
  availabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  availabilityText: {
    fontSize: 13,
    fontWeight: "600",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4C6EF5",
  },
});
