import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Card from "../../components/Card";
import { LibraryForm, LibraryFormData } from "../../components/LibraryForm";
import { useModalPortal } from "../../components/ModalPortal";
import Screen from "../../components/Screen";
import {
    createLibraryItem,
    deleteLibraryItem,
    getLibraryItems,
    LibraryItem,
    updateLibraryItem,
} from "../../services/libraryService";

type LibraryBook = LibraryItem;

export default function TeacherLibraryScreen() {
  const { showModal, hideModal } = useModalPortal();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [teacherName, setTeacherName] = useState("Teacher");

  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Computer Science"];

  useEffect(() => {
    fetchBooks();
    AsyncStorage.getItem("userName").then(name => { if (name) setTeacherName(name); }).catch(() => {});
  }, []);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const list = await getLibraryItems();
      setBooks(list);
    } catch (err) {
      console.warn("Error fetching library:", err);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  const openForm = (book?: LibraryBook) => {
    const isEditing = !!book;
    const initialData: LibraryFormData = book ? {
      title: book.title,
      author: book.author,
      subject: book.subject,
      type: book.type,
      fileUrl: book.fileUrl || "",
      availableCopies: (book.availableCopies || 1).toString(),
      totalCopies: (book.totalCopies || 1).toString(),
    } : {
      title: "",
      author: "",
      subject: "Mathematics",
      type: "PDF",
      fileUrl: "",
      availableCopies: "1",
      totalCopies: "1",
    };

    const modalId = showModal(
      <LibraryForm
        initialData={initialData}
        onClose={() => {
          hideModal(modalId);
          resetForm();
        }}
        onSave={(data) => {
          handleSave(data);
          hideModal(modalId);
        }}
        isEditing={isEditing}
      />,
      { onClose: () => resetForm() }
    );
  };

  const handleSave = async (data: LibraryFormData) => {
    if (!data.title || !data.author) {
      Alert.alert("Error", "Please fill in title and author");
      return;
    }

    try {
      const bookData = {
        title: data.title,
        author: data.author,
        subject: data.subject,
        type: data.type,
        fileUrl: data.fileUrl,
        availableCopies: parseInt(data.availableCopies) || 1,
        totalCopies: parseInt(data.totalCopies) || 1,
        uploadedBy: teacherName,
        uploadedDate: new Date().toISOString(),
      } as Parameters<typeof createLibraryItem>[0];

      if (editingId) {
        await updateLibraryItem(editingId, { ...bookData });
        Alert.alert("Success", "Book updated!");
      } else {
        await createLibraryItem({ ...bookData });
        Alert.alert("Success", "Book added!");
      }

      resetForm();
      fetchBooks();
    } catch (err) {
      Alert.alert("Error", "Failed to save book");
    }
  };

  const handleEdit = (book: LibraryBook) => {
    setEditingId(book.id || null);
    openForm(book);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert("Delete Book", "Delete '" + title + "'?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteLibraryItem(id);
            Alert.alert("Success", "Book deleted!");
            fetchBooks();
          } catch (err) {
            Alert.alert("Error", "Failed to delete");
          }
        },
      },
    ]);
  };

  const resetForm = () => {
    setEditingId(null);
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

  const filteredBooks = books.filter((book) =>
    book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Library</Text>
            <Text style={styles.headerSubtitle}>{books.length} books</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              resetForm();
              openForm();
            }}
          >
            <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search books..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#4C6EF5" />
          </View>
        ) : filteredBooks.length === 0 ? (
          <View style={styles.centerContainer}>
            <MaterialCommunityIcons name="bookshelf" size={64} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No books found</Text>
            <Text style={styles.emptyText}>Tap + to add a book</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {filteredBooks.map((book) => {
              const subjectColor = getSubjectColor(book.subject);
              const isAvailable = (book.availableCopies || 0) > 0;

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

                  {book.totalCopies && (
                    <View style={styles.availabilityRow}>
                      <MaterialCommunityIcons
                        name={isAvailable ? "check-circle" : "close-circle"}
                        size={16}
                        color={isAvailable ? "#10B981" : "#EF4444"}
                      />
                      <Text style={styles.availabilityText}>
                        {book.availableCopies}/{book.totalCopies} available
                      </Text>
                    </View>
                  )}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleEdit(book)}
                    >
                      <MaterialCommunityIcons name="pencil" size={16} color="#4C6EF5" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(book.id!, book.title)}
                    >
                      <MaterialCommunityIcons name="delete" size={16} color="#EF4444" />
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Screen>
    </>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
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
  subjectTag: {
    fontSize: 12,
    fontWeight: "700",
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
    color: "#6B7280",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4C6EF5",
  },
  deleteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
  },
});
