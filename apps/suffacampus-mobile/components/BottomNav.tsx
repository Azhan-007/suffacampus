import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface NavItem {
  icon: string;
  label: string;
  active?: boolean;
  route?: string;
}

interface BottomNavProps {
  items: NavItem[];
  onItemPress?: (index: number) => void;
}

export default function BottomNav({ items, onItemPress }: BottomNavProps) {
  const handlePress = (index: number, route?: string) => {
    if (route) {
      router.push(route as any);
    }
    onItemPress?.(index);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <View style={styles.container}>
        <View style={styles.navContent}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.navItem}
              onPress={() => handlePress(index, item.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, item.active && styles.iconContainerActive]}>
                <MaterialIcons
                  name={item.icon as any}
                  size={24}
                  color={item.active ? "#4C6EF5" : "#6B7280"}
                />
              </View>
              <Text style={[styles.label, item.active && styles.activeLabel]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    paddingBottom: 12,
  },
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    height: 64,
  },
  navContent: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: "100%",
    paddingHorizontal: 16,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  iconContainerActive: {
    backgroundColor: "rgba(76, 110, 245, 0.12)",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  activeLabel: {
    color: "#4C6EF5",
    fontWeight: "700",
  },
});

