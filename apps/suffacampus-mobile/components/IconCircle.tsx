import { StyleSheet, Text, View, ViewStyle } from "react-native";

interface IconCircleProps {
  icon: string;
  backgroundColor: string;
  size?: number;
  style?: ViewStyle;
}

export default function IconCircle({ 
  icon, 
  backgroundColor, 
  size = 56,
  style 
}: IconCircleProps) {
  return (
    <View 
      style={[
        styles.container, 
        { 
          backgroundColor, 
          width: size, 
          height: size,
          borderRadius: size / 2,
        },
        style
      ]}
    >
      <Text style={styles.icon}>{icon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  icon: {
    fontSize: 26,
  },
});
