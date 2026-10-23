import {
  formatToman,
  formatTomanWithUnit,
  TOMAN_UNIT,
} from "@finora/shared";
import { StyleSheet, View } from "react-native";

import type { OverviewSummary } from "../../lib/overview.ts";
import { radius, spacing } from "../../theme/tokens.ts";
import { useTheme } from "../../theme/useTheme.ts";
import { AppText } from "../ui/AppText.tsx";

export interface SummaryCardProps {
  summary: OverviewSummary;
}

export function SummaryCard({ summary }: SummaryCardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.heroBackground,
          borderColor: colors.accentBorder,
        },
      ]}
    >
      <View
        style={[
          styles.glowLarge,
          { backgroundColor: colors.heroAccent },
        ]}
      />
      <View
        style={[
          styles.glowSmall,
          { backgroundColor: colors.heroAccent },
        ]}
      />

      <View style={styles.headerRow}>
        <AppText
          weight="medium"
          style={[styles.label, { color: colors.heroMuted }]}
        >
          موجودی کل
        </AppText>
        <View
          style={[styles.tag, { borderColor: colors.heroAccent }]}
        >
          <AppText
            weight="medium"
            style={[styles.tagText, { color: colors.heroAccent }]}
          >
            نمای نمونه
          </AppText>
        </View>
      </View>

      <View style={styles.balanceRow}>
        <AppText
          weight="extraBold"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.balance, { color: colors.heroForeground }]}
        >
          {formatToman(summary.balance)}
        </AppText>
        <AppText
          weight="medium"
          style={[styles.unit, { color: colors.heroMuted }]}
        >
          {TOMAN_UNIT}
        </AppText>
      </View>

      <View
        style={[styles.divider, { backgroundColor: colors.heroMuted }]}
      />

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <AppText
            style={[styles.statLabel, { color: colors.heroMuted }]}
          >
            درآمد این ماه
          </AppText>
          <AppText
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.statValue, { color: colors.heroPositive }]}
          >
            {formatTomanWithUnit(summary.income)}
          </AppText>
        </View>

        <View
          style={[styles.verticalDivider, { backgroundColor: colors.heroMuted }]}
        />

        <View style={styles.stat}>
          <AppText
            style={[styles.statLabel, { color: colors.heroMuted }]}
          >
            هزینه این ماه
          </AppText>
          <AppText
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[styles.statValue, { color: colors.heroNegative }]}
          >
            {formatTomanWithUnit(summary.expense)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  balance: {
    fontSize: 32,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  balanceRow: {
    alignItems: "flex-end",
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  container: {
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    overflow: "hidden",
    padding: spacing.xl,
  },
  divider: {
    height: 1,
    opacity: 0.2,
  },
  glowLarge: {
    borderRadius: radius.pill,
    height: 210,
    left: -70,
    opacity: 0.08,
    position: "absolute",
    top: -110,
    width: 210,
  },
  glowSmall: {
    borderRadius: radius.pill,
    bottom: -70,
    height: 150,
    opacity: 0.06,
    position: "absolute",
    right: -40,
    width: 150,
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 13,
    lineHeight: 20,
  },
  stat: {
    flex: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: "row-reverse",
    gap: spacing.lg,
  },
  statValue: {
    fontSize: 14,
    lineHeight: 22,
  },
  tag: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    lineHeight: 16,
  },
  unit: {
    fontSize: 13,
    lineHeight: 22,
    paddingBottom: 6,
  },
  verticalDivider: {
    opacity: 0.2,
    width: 1,
  },
});
