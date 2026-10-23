import { StyleSheet, View } from "react-native";

import { radius, spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";
import { AppText } from "./ui/AppText.tsx";
import { Icon, type IconName } from "./ui/Icon.tsx";

interface TabItem {
  key: string;
  label: string;
  icon: IconName;
  active: boolean;
}

const TABS: TabItem[] = [
  { key: "overview", label: "نمای کلی", icon: "grid-outline", active: true },
  {
    key: "transactions",
    label: "تراکنش‌ها",
    icon: "swap-horizontal-outline",
    active: false,
  },
  { key: "accounts", label: "حساب‌ها", icon: "wallet-outline", active: false },
  {
    key: "reports",
    label: "گزارش‌ها",
    icon: "pie-chart-outline",
    active: false,
  },
];

export interface BottomTabBarProps {
  bottomInset: number;
}

export function BottomTabBar({ bottomInset }: BottomTabBarProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(bottomInset, spacing.sm),
        },
      ]}
    >
      {TABS.map((tab) => (
        <View
          key={tab.key}
          accessibilityRole="button"
          accessibilityState={{ disabled: !tab.active, selected: tab.active }}
          accessibilityHint={
            tab.active ? undefined : "در نسخه‌های بعدی فعال می‌شود"
          }
          style={styles.tab}
        >
          <View
            style={[
              styles.iconBox,
              tab.active && { backgroundColor: colors.primarySubtle },
            ]}
          >
            <Icon
              name={tab.icon}
              size={19}
              color={
                tab.active ? colors.primary : colors.disabledForeground
              }
            />
          </View>
          <AppText
            weight={tab.active ? "medium" : "regular"}
            numberOfLines={1}
            style={[
              styles.label,
              {
                color: tab.active
                  ? colors.primary
                  : colors.disabledForeground,
              },
            ]}
          >
            {tab.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    flexDirection: "row-reverse",
    paddingTop: spacing.sm,
  },
  iconBox: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 30,
    justifyContent: "center",
    width: 48,
  },
  label: {
    fontSize: 10,
    lineHeight: 16,
    textAlign: "center",
  },
  tab: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
    paddingVertical: 2,
  },
});
