import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Card from "./Card";

interface ProfileHeaderProps {
  name: string;
  studentId: string;
  avatarUrl?: string;
}

export default function ProfileHeader({ name, studentId, avatarUrl }: ProfileHeaderProps) {
  return (
    <Card style={styles.container}>
      <View style={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.studentId}>ID: {studentId}</Text>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <View style={styles.notificationIcon}>
            <Text style={styles.bell}>🔔</Text>
          </View>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4C6EF5",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 4,
  },
  studentId: {
    fontSize: 14,
    color: "#6B7280",
  },
  notificationButton: {
    padding: 8,
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F6FB",
    justifyContent: "center",
    alignItems: "center",
  },
  bell: {
    fontSize: 20,
  },
});
