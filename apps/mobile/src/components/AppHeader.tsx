import { Pressable, StyleSheet, View } from "react-native";

import { radius, spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";
import { Brand } from "./Brand.tsx";
import { AppText } from "./ui/AppText.tsx";
import { Icon } from "./ui/Icon.tsx";

export interface AppHeaderProps {
  userName: string;
  onLogout: () => void;
}

export function AppHeader({ userName, onLogout }: AppHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Brand />
      <View style={styles.actions}>
        <View
          style={[
            styles.badge,
            {
              backgroundColor: colors.primarySubtle,
              borderColor: colors.primary,
            },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <AppText
            weight="medium"
            numberOfLines={1}
            style={[styles.badgeText, { color: colors.primary }]}
          >
            {userName}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="خروج از حساب"
          onPress={onLogout}
          style={({ pressed }) => [
            styles.logout,
            {
              borderColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Icon name="log-out-outline" size={19} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  badge: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row-reverse",
    gap: spacing.xs,
    maxWidth: 130,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 18,
  },
  container: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dot: {
    borderRadius: radius.pill,
    height: 6,
    width: 6,
  },
  logout: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
});
