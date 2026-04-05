import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Card from "../../components/Card";
import { getSummaryConfig, saveSummaryConfig } from "../../services/configService";

interface SummaryConfig {
  enabled: boolean;
  title: string;
  items: {
    classesToday: {
      enabled: boolean;
      label: string;
      icon: string;
      color: string;
      route: string;
    };
    classesCompleted: {
      enabled: boolean;
      label: string;
      icon: string;
      color: string;
      route: string;
    };
    totalStudents: {
      enabled: boolean;
      label: string;
      icon: string;
      color: string;
      route: string;
    };
  };
}

export default function SummaryCardConfig() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SummaryConfig>({
    enabled: true,
    title: "Today's Summary",
    items: {
      classesToday: {
        enabled: true,
        label: "Classes Today",
        icon: "calendar-today",
        color: "#4C6EF5",
        route: "/teacher/timetable",
      },
      classesCompleted: {
        enabled: true,
        label: "Completed",
        icon: "check-circle",
        color: "#10B981",
        route: "/teacher/timetable",
      },
      totalStudents: {
        enabled: true,
        label: "Total Students",
        icon: "account-group",
        color: "#F59E0B",
        route: "/admin/manage-students",
      },
    },
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const data = await getSummaryConfig();
      if (data) setConfig(data as SummaryConfig);
    } catch (error: any) {
      console.warn("Error fetching config:", error?.message || error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveSummaryConfig(config);
      Alert.alert("Success", "Summary card configuration saved successfully!");
    } catch (error: any) {
      console.warn("Error saving config:", error?.message || error);
      Alert.alert("Error", "Failed to save configuration: " + (error?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const updateItemConfig = (
    itemKey: keyof SummaryConfig["items"],
    field: string,
    value: any
  ) => {
    setConfig({
      ...config,
      items: {
        ...config.items,
        [itemKey]: {
          ...config.items[itemKey],
          [field]: value,
        },
      },
    });
  };

  const presetColors = [
    { name: "Blue", value: "#4C6EF5" },
    { name: "Green", value: "#10B981" },
    { name: "Orange", value: "#F59E0B" },
    { name: "Purple", value: "#8B5CF6" },
    { name: "Red", value: "#EF4444" },
    { name: "Teal", value: "#14B8A6" },
    { name: "Pink", value: "#EC4899" },
    { name: "Indigo", value: "#6366F1" },
  ];

  const presetIcons = [
    "calendar-today",
    "check-circle",
    "account-group",
    "clipboard-check",
    "chart-line",
    "book-open",
    "trophy",
    "school",
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4C6EF5" />
          <Text style={styles.loadingText}>Loading configuration...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Summary Card Config</Text>
        <TouchableOpacity
          onPress={handleSave}
          style={styles.saveButton}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="check" size={24} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* General Settings */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="cog" size={22} color="#4C6EF5" />
            <Text style={styles.sectionTitle}>General Settings</Text>
          </View>

          {/* Enable/Disable Card */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable Summary Card</Text>
              <Text style={styles.settingDescription}>Show summary card on dashboard</Text>
            </View>
            <Switch
              value={config.enabled}
              onValueChange={(value) => setConfig({ ...config, enabled: value })}
              trackColor={{ false: "#E2E8F0", true: "#A5D6FF" }}
              thumbColor={config.enabled ? "#4C6EF5" : "#CBD5E1"}
            />
          </View>

          <View style={styles.divider} />

          {/* Card Title */}
          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Card Title</Text>
            <TextInput
              style={styles.textInput}
              value={config.title}
              onChangeText={(text) => setConfig({ ...config, title: text })}
              placeholder="Today's Summary"
              placeholderTextColor="#94A3B8"
            />
          </View>
        </Card>

        {/* Classes Today Item */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name={config.items.classesToday.icon as any}
              size={22}
              color={config.items.classesToday.color}
            />
            <Text style={styles.sectionTitle}>Classes Today</Text>
          </View>

          {/* Enable/Disable */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable</Text>
            </View>
            <Switch
              value={config.items.classesToday.enabled}
              onValueChange={(value) => updateItemConfig("classesToday", "enabled", value)}
              trackColor={{ false: "#E2E8F0", true: "#A5D6FF" }}
              thumbColor={config.items.classesToday.enabled ? "#4C6EF5" : "#CBD5E1"}
            />
          </View>

          <View style={styles.divider} />

          {/* Label */}
          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Label</Text>
            <TextInput
              style={styles.textInput}
              value={config.items.classesToday.label}
              onChangeText={(text) => updateItemConfig("classesToday", "label", text)}
              placeholder="Classes Today"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.divider} />

          {/* Color Picker */}
          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {presetColors.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color.value },
                    config.items.classesToday.color === color.value && styles.colorOptionSelected,
                  ]}
                  onPress={() => updateItemConfig("classesToday", "color", color.value)}
                >
                  {config.items.classesToday.color === color.value && (
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Icon Picker */}
          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {presetIcons.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconOption,
                    config.items.classesToday.icon === icon && styles.iconOptionSelected,
                  ]}
                  onPress={() => updateItemConfig("classesToday", "icon", icon)}
                >
                  <MaterialCommunityIcons
                    name={icon as any}
                    size={24}
                    color={config.items.classesToday.icon === icon ? "#4C6EF5" : "#64748B"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Card>

        {/* Completed Item */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name={config.items.classesCompleted.icon as any}
              size={22}
              color={config.items.classesCompleted.color}
            />
            <Text style={styles.sectionTitle}>Completed Classes</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable</Text>
            </View>
            <Switch
              value={config.items.classesCompleted.enabled}
              onValueChange={(value) => updateItemConfig("classesCompleted", "enabled", value)}
              trackColor={{ false: "#E2E8F0", true: "#A5D6FF" }}
              thumbColor={config.items.classesCompleted.enabled ? "#4C6EF5" : "#CBD5E1"}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Label</Text>
            <TextInput
              style={styles.textInput}
              value={config.items.classesCompleted.label}
              onChangeText={(text) => updateItemConfig("classesCompleted", "label", text)}
              placeholder="Completed"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {presetColors.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color.value },
                    config.items.classesCompleted.color === color.value && styles.colorOptionSelected,
                  ]}
                  onPress={() => updateItemConfig("classesCompleted", "color", color.value)}
                >
                  {config.items.classesCompleted.color === color.value && (
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {presetIcons.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconOption,
                    config.items.classesCompleted.icon === icon && styles.iconOptionSelected,
                  ]}
                  onPress={() => updateItemConfig("classesCompleted", "icon", icon)}
                >
                  <MaterialCommunityIcons
                    name={icon as any}
                    size={24}
                    color={config.items.classesCompleted.icon === icon ? "#4C6EF5" : "#64748B"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Card>

        {/* Total Students Item */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons
              name={config.items.totalStudents.icon as any}
              size={22}
              color={config.items.totalStudents.color}
            />
            <Text style={styles.sectionTitle}>Total Students</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Enable</Text>
            </View>
            <Switch
              value={config.items.totalStudents.enabled}
              onValueChange={(value) => updateItemConfig("totalStudents", "enabled", value)}
              trackColor={{ false: "#E2E8F0", true: "#A5D6FF" }}
              thumbColor={config.items.totalStudents.enabled ? "#4C6EF5" : "#CBD5E1"}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Label</Text>
            <TextInput
              style={styles.textInput}
              value={config.items.totalStudents.label}
              onChangeText={(text) => updateItemConfig("totalStudents", "label", text)}
              placeholder="Total Students"
              placeholderTextColor="#94A3B8"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {presetColors.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color.value },
                    config.items.totalStudents.color === color.value && styles.colorOptionSelected,
                  ]}
                  onPress={() => updateItemConfig("totalStudents", "color", color.value)}
                >
                  {config.items.totalStudents.color === color.value && (
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingColumn}>
            <Text style={styles.settingLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {presetIcons.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconOption,
                    config.items.totalStudents.icon === icon && styles.iconOptionSelected,
                  ]}
                  onPress={() => updateItemConfig("totalStudents", "icon", icon)}
                >
                  <MaterialCommunityIcons
                    name={icon as any}
                    size={24}
                    color={config.items.totalStudents.icon === icon ? "#4C6EF5" : "#64748B"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Card>

        {/* Preview Card */}
        <Card style={styles.previewCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="eye" size={22} color="#4C6EF5" />
            <Text style={styles.sectionTitle}>Preview</Text>
          </View>
          <View style={styles.previewContent}>
            <Text style={styles.previewTitle}>{config.title}</Text>
            <View style={styles.previewItems}>
              {config.items.classesToday.enabled && (
                <View style={styles.previewItem}>
                  <View
                    style={[
                      styles.previewIcon,
                      { backgroundColor: config.items.classesToday.color + "20" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={config.items.classesToday.icon as any}
                      size={24}
                      color={config.items.classesToday.color}
                    />
                  </View>
                  <Text style={styles.previewValue}>4</Text>
                  <Text style={styles.previewLabel}>{config.items.classesToday.label}</Text>
                </View>
              )}
              {config.items.classesCompleted.enabled && (
                <View style={styles.previewItem}>
                  <View
                    style={[
                      styles.previewIcon,
                      { backgroundColor: config.items.classesCompleted.color + "20" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={config.items.classesCompleted.icon as any}
                      size={24}
                      color={config.items.classesCompleted.color}
                    />
                  </View>
                  <Text style={[styles.previewValue, { color: config.items.classesCompleted.color }]}>
                    2
                  </Text>
                  <Text style={styles.previewLabel}>{config.items.classesCompleted.label}</Text>
                </View>
              )}
              {config.items.totalStudents.enabled && (
                <View style={styles.previewItem}>
                  <View
                    style={[
                      styles.previewIcon,
                      { backgroundColor: config.items.totalStudents.color + "20" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={config.items.totalStudents.icon as any}
                      size={24}
                      color={config.items.totalStudents.color}
                    />
                  </View>
                  <Text style={styles.previewValue}>156</Text>
                  <Text style={styles.previewLabel}>{config.items.totalStudents.label}</Text>
                </View>
              )}
            </View>
          </View>
        </Card>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
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
  saveButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4C6EF5",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#64748B",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionCard: {
    marginBottom: 16,
    padding: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: "#64748B",
  },
  settingColumn: {
    paddingVertical: 12,
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1E293B",
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  iconOption: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  iconOptionSelected: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4C6EF5",
    borderWidth: 2,
  },
  previewCard: {
    marginBottom: 16,
    padding: 20,
    backgroundColor: "#4C6EF5",
  },
  previewContent: {
    gap: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  previewItems: {
    flexDirection: "row",
    gap: 12,
  },
  previewItem: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    padding: 16,
    borderRadius: 12,
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  previewValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
  },
  bottomPadding: {
    height: 40,
  },
});
