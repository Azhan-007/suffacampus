import { Stack } from "expo-router";
import { ModalPortalProvider } from "../../components/ModalPortal";

export default function TeacherLayout() {
  return (
    <ModalPortalProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 200,
        }}
      />
    </ModalPortalProvider>
  );
}
