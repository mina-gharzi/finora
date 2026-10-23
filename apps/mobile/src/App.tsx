import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "./auth/AuthContext.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { LoginScreen } from "./screens/LoginScreen.tsx";
import { OverviewScreen } from "./screens/OverviewScreen.tsx";
import { useTheme } from "./theme/useTheme.ts";

function Root() {
  const { colors } = useTheme();
  const { status, session, signOut } = useAuth();

  if (status === "restoring") {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (status === "signedOut" || !session) {
    return <LoginScreen />;
  }

  return (
    <AppShell
      userName={session.user.name}
      onLogout={() => {
        void signOut().catch(() => {
          Alert.alert(
            "خروج انجام نشد",
            "حذف اطلاعات ورود از دستگاه ممکن نشد. لطفاً دوباره تلاش کنید.",
          );
        });
      }}
    >
      <OverviewScreen />
    </AppShell>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    "Pinar-Regular": require("../assets/fonts/PINAR-DS3-REGULAR.ttf"),
    "Pinar-Medium": require("../assets/fonts/PINAR-MEDIUM.ttf"),
    "Pinar-Bold": require("../assets/fonts/PINAR-BOLD.ttf"),
    "Pinar-ExtraBold": require("../assets/fonts/PINAR-DS3-EXTRABOLD2.ttf"),
  });
  const { colors, isDark } = useTheme();

  if (!fontsLoaded && !fontError) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
