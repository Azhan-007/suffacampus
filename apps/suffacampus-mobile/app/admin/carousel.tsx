import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CarouselItem, createCarouselItem, deleteCarouselItem, getCarouselItems, updateCarouselItem } from "../../services/carouselService";

export default function CarouselManagement() {
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CarouselItem | null>(null);
  const [formData, setFormData] = useState({
    uri: "",
    title: "",
    subtitle: "",
    order: 1,
  });

  useEffect(() => {
    fetchCarouselItems();
  }, []);

  const fetchCarouselItems = async () => {
    try {
      setLoading(true);
      const items = await getCarouselItems();
      setCarouselItems(items);
    } catch (error: any) {
      console.warn("Error fetching carousel:", error?.message || error);
      Alert.alert("Error", "Failed to load carousel items.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (item?: CarouselItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        uri: item.uri,
        title: item.title,
        subtitle: item.subtitle,
        order: item.order,
      });
    } else {
      setEditingItem(null);
      setFormData({
        uri: "",
        title: "",
        subtitle: "",
        order: carouselItems.length + 1,
      });
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingItem(null);
    setFormData({
      uri: "",
      title: "",
      subtitle: "",
      order: 1,
    });
  };

  const handleSave = async () => {
    if (!formData.uri || !formData.title || !formData.subtitle) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      if (editingItem) {
        await updateCarouselItem(editingItem.id, {
          uri: formData.uri,
          title: formData.title,
          subtitle: formData.subtitle,
          order: formData.order,
        });
        Alert.alert("Success", "Carousel item updated successfully!");
      } else {
        await createCarouselItem({
          uri: formData.uri,
          title: formData.title,
          subtitle: formData.subtitle,
          order: formData.order,
        });
        Alert.alert("Success", "Carousel item added successfully!");
      }
      handleCloseModal();
      fetchCarouselItems();
    } catch (error: any) {
      console.warn("Error saving carousel item:", error?.message || error);
      Alert.alert("Error", "Failed to save carousel item: " + (error?.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item: CarouselItem) => {
    Alert.alert(
      "Delete Carousel Item",
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              await deleteCarouselItem(item.id);
              Alert.alert("Success", "Carousel item deleted successfully!");
              fetchCarouselItems();
            } catch (error: any) {
              console.warn("Error deleting carousel item:", error?.message || error);
              Alert.alert("Error", "Failed to delete carousel item");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMoveUp = async (item: CarouselItem, index: number) => {
    if (index === 0) return;

    const prevItem = carouselItems[index - 1];
    try {
      await updateCarouselItem(item.id, { order: index });
      await updateCarouselItem(prevItem.id, { order: index + 1 });
      fetchCarouselItems();
    } catch (error) {
      Alert.alert("Error", "Failed to reorder items");
    }
  };

  const handleMoveDown = async (item: CarouselItem, index: number) => {
    if (index === carouselItems.length - 1) return;

    const nextItem = carouselItems[index + 1];
    try {
      await updateCarouselItem(item.id, { order: index + 2 });
      await updateCarouselItem(nextItem.id, { order: index + 1 });
      fetchCarouselItems();
    } catch (error) {
      Alert.alert("Error", "Failed to reorder items");
    }
  };

  return (
    <>
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Carousel Management</Text>
        <TouchableOpacity onPress={() => handleOpenModal()} style={styles.addButton}>
          <MaterialCommunityIcons name="plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading && carouselItems.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4C6EF5" />
            <Text style={styles.loadingText}>Loading carousel items...</Text>
          </View>
        ) : carouselItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="image-multiple-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyText}>No carousel items yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first item</Text>
          </View>
        ) : (
          carouselItems.map((item, index) => (
            <View key={item.id} style={styles.carouselCard}>
              {/* Image Preview */}
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: item.uri }} style={styles.imagePreview} resizeMode="cover" />
                <View style={styles.orderBadge}>
                  <Text style={styles.orderText}>#{item.order}</Text>
                </View>
              </View>

              {/* Details */}
              <View style={styles.detailsContainer}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.itemSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
                <Text style={styles.itemUrl} numberOfLines={1}>
                  {item.uri}
                </Text>

                {/* Actions */}
                <View style={styles.actionsRow}>
                  {/* Reorder Buttons */}
                  <View style={styles.reorderButtons}>
                    <TouchableOpacity
                      onPress={() => handleMoveUp(item, index)}
                      disabled={index === 0}
                      style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                    >
                      <MaterialCommunityIcons
                        name="arrow-up"
                        size={18}
                        color={index === 0 ? "#CBD5E1" : "#4C6EF5"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleMoveDown(item, index)}
                      disabled={index === carouselItems.length - 1}
                      style={[
                        styles.reorderButton,
                        index === carouselItems.length - 1 && styles.reorderButtonDisabled,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="arrow-down"
                        size={18}
                        color={index === carouselItems.length - 1 ? "#CBD5E1" : "#4C6EF5"}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Edit & Delete */}
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={() => handleOpenModal(item)}
                      style={styles.editButton}
                    >
                      <MaterialCommunityIcons name="pencil" size={18} color="#4C6EF5" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(item)}
                      style={styles.deleteButton}
                    >
                      <MaterialCommunityIcons name="delete" size={18} color="#EF4444" />
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? "Edit Carousel Item" : "Add Carousel Item"}
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <MaterialCommunityIcons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Form */}
            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              {/* Image URL */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Image URL *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.uri}
                  onChangeText={(text) => setFormData({ ...formData, uri: text })}
                  placeholder="https://example.com/image.jpg"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  multiline
                />
              </View>

              {/* Image Preview */}
              {formData.uri && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Preview</Text>
                  <Image
                    source={{ uri: formData.uri }}
                    style={styles.modalImagePreview}
                    resizeMode="cover"
                  />
                </View>
              )}

              {/* Title */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Title *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                  placeholder="Welcome to Our School"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Subtitle */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Subtitle *</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.subtitle}
                  onChangeText={(text) => setFormData({ ...formData, subtitle: text })}
                  placeholder="Excellence in Education"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Order */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Display Order</Text>
                <TextInput
                  style={styles.formInput}
                  value={formData.order.toString()}
                  onChangeText={(text) =>
                    setFormData({ ...formData, order: parseInt(text) || 1 })
                  }
                  placeholder="1"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                />
                <Text style={styles.formHint}>Lower numbers appear first</Text>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={styles.saveButton}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingItem ? "Update" : "Add"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F6FB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
    flex: 1,
    textAlign: "center",
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#64748B",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#94A3B8",
    marginTop: 8,
  },
  carouselCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  imagePreviewContainer: {
    position: "relative",
    width: "100%",
    height: 180,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  orderBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "#4C6EF5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  orderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  detailsContainer: {
    padding: 16,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 8,
  },
  itemUrl: {
    fontSize: 12,
    color: "#94A3B8",
    fontStyle: "italic",
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reorderButtons: {
    flexDirection: "row",
    gap: 8,
  },
  reorderButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  reorderButtonDisabled: {
    backgroundColor: "#F1F5F9",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4C6EF5",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#EF4444",
  },
  bottomPadding: {
    height: 40,
  },
  // Modal Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 50,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E293B",
  },
  modalForm: {
    paddingHorizontal: 20,
    paddingTop: 20,
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
  formHint: {
    fontSize: 12,
    color: "#94A3B8",
    marginTop: 6,
  },
  modalImagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 12,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
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
});

