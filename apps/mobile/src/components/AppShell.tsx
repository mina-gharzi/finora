import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";
import { AppHeader } from "./AppHeader.tsx";
import { BottomTabBar } from "./BottomTabBar.tsx";

export interface AppShellProps {
  children: ReactNode;
  userName: string;
  onLogout: () => void;
}

export function AppShell({ children, userName, onLogout }: AppShellProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.safeArea, { backgroundColor: colors.background }]}
      >
        <AppHeader userName={userName} onLogout={onLogout} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
      <BottomTabBar bottomInset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
});
