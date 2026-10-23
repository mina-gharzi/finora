import { StyleSheet, View } from "react-native";

import { radius, spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";
import { AppText } from "./ui/AppText.tsx";
import { Icon } from "./ui/Icon.tsx";

export interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.mark, { backgroundColor: colors.accent }]}>
        <Icon
          name="flag-outline"
          size={18}
          color={colors.accentForeground}
        />
      </View>
      {!compact && (
        <AppText
          weight="bold"
          style={[styles.wordmark, { color: colors.primary }]}
        >
          فینورا
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  mark: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  wordmark: {
    fontSize: 20,
    lineHeight: 28,
  },
});
