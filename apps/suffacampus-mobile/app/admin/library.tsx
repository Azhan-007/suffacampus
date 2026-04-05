import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import Screen from "../../components/Screen";
import { getLibraryItems, LibraryItem } from "../../services/libraryService";

export default function AdminLibraryScreen() {
  const [books, setBooks] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const items = await getLibraryItems();
      setBooks(items);
    } catch (error) {
      console.warn("Error fetching library:", error);
      setBooks([]);
    } finally {
      setLoading(false);
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

  const totalBooks = books.reduce((sum, book) => sum + (book.totalCopies ?? 0), 0);
  const availableBooks = books.reduce((sum, book) => sum + (book.availableCopies ?? 0), 0);
  const issuedBooks = totalBooks - availableBooks;

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Library Overview</Text>
          <Text style={styles.headerSubtitle}>Admin</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <MaterialCommunityIcons name="bookshelf" size={32} color="#4C6EF5" />
          <Text style={styles.statNumber}>{totalBooks}</Text>
          <Text style={styles.statLabel}>Total Books</Text>
        </View>

        <View style={styles.statCard}>
          <MaterialCommunityIcons name="book-check" size={32} color="#10B981" />
          <Text style={styles.statNumber}>{availableBooks}</Text>
          <Text style={styles.statLabel}>Available</Text>
        </View>

        <View style={styles.statCard}>
          <MaterialCommunityIcons name="book-clock" size={32} color="#EF4444" />
          <Text style={styles.statNumber}>{issuedBooks}</Text>
          <Text style={styles.statLabel}>Issued</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
        </View>
      ) : (
        <View style={styles.listContainer}>
          <Text style={styles.sectionTitle}>All Books</Text>
          {books.map((book) => {
            const subjectColor = getSubjectColor(book.subject);
            const availability = ((book.availableCopies ?? 0) / (book.totalCopies ?? 1)) * 100;

            return (
              <Card key={book.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: subjectColor + "15" }]}>
                    <MaterialCommunityIcons
                      name={getTypeIcon(book.type) as any}
                      size={28}
                      color={subjectColor}
                    />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle}>{book.title}</Text>
                    <Text style={styles.cardAuthor}>{book.author}</Text>
                    <Text style={[styles.subjectTag, { color: subjectColor }]}>
                      {book.subject}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statItemLabel}>Available</Text>
                    <Text style={styles.statItemValue}>
                      {book.availableCopies}/{book.totalCopies}
                    </Text>
                  </View>
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${availability}%`,
                            backgroundColor: availability > 50 ? "#10B981" : availability > 20 ? "#F59E0B" : "#EF4444",
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.availabilityLabel,
                        {
                          color: availability > 50 ? "#10B981" : availability > 20 ? "#F59E0B" : "#EF4444",
                        },
                      ]}
                    >
                      {availability > 50 ? "Good" : availability > 20 ? "Low" : "Critical"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.uploadedBy}>Uploaded by {book.uploadedBy}</Text>
              </Card>
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
  statsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  listContainer: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
    marginBottom: 8,
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
  subjectTag: {
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  statItem: {
    gap: 4,
  },
  statItemLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  statItemValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  progressContainer: {
    flex: 1,
    gap: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  availabilityLabel: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  uploadedBy: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
  },
});
