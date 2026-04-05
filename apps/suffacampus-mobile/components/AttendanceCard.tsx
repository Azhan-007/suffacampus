import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

export default function AttendanceCard({ percent, present, total }: { percent: number, present: number, total: number }) {
  return (
    <View style={styles.card}>
      <MaterialIcons name="fact-check" size={26} color="#4C6EF5" />
      <View style={styles.textBlock}>
        <Text style={styles.title}>Attendance</Text>
        <Text style={styles.percent}>{percent}% This Month</Text>
        <Text style={styles.days}>{present} / {total} Days</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 14,
    elevation: 3,
  },
  textBlock: { marginLeft: 14 },
  title: { fontSize: 18, fontWeight: "700" },
  percent: { fontSize: 16, color: "#4C6EF5", marginTop: 2 },
  days: { fontSize: 13, color: "#6B7280", marginTop: 2 },
});
