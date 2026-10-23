import { formatTomanWithUnit } from "@finora/shared";
import { StyleSheet, View } from "react-native";

import type { OverviewCategorySlice } from "../../lib/overview.ts";
import { radius, spacing } from "../../theme/tokens.ts";
import { useTheme } from "../../theme/useTheme.ts";
import { SectionCard } from "../SectionCard.tsx";
import { AppText } from "../ui/AppText.tsx";

export interface CategoriesCardProps {
  categories: OverviewCategorySlice[];
}

export function CategoriesCard({ categories }: CategoriesCardProps) {
  const { colors } = useTheme();

  return (
    <SectionCard
      title="ترکیب هزینه‌ها"
      subtitle="سهم هر دسته از کل هزینه‌های نمونه"
    >
      <View style={styles.list}>
        {categories.map((category) => (
          <View key={category.id} style={styles.item}>
            <View style={styles.labelRow}>
              <AppText
                weight="medium"
                numberOfLines={1}
                style={[styles.name, { color: colors.foreground }]}
              >
                {category.name}
              </AppText>
              <View style={styles.valueRow}>
                <AppText
                  style={[styles.value, { color: colors.mutedForeground }]}
                >
                  {formatTomanWithUnit(category.amount)}
                </AppText>
                <AppText
                  weight="medium"
                  style={[styles.percent, { color: colors.primary }]}
                >
                  {category.percent}%
                </AppText>
              </View>
            </View>

            <View
              style={[styles.track, { backgroundColor: colors.surfaceMuted }]}
            >
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.primary,
                    width: `${category.percent}%`,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  fill: {
    alignSelf: "flex-end",
    borderRadius: radius.pill,
    height: "100%",
  },
  item: {
    gap: 6,
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  list: {
    gap: spacing.md,
  },
  name: {
    flex: 1,
    fontSize: 12,
    lineHeight: 20,
  },
  percent: {
    fontSize: 11,
    lineHeight: 18,
  },
  track: {
    borderRadius: radius.pill,
    height: 6,
    overflow: "hidden",
  },
  value: {
    fontSize: 11,
    lineHeight: 18,
  },
  valueRow: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
});
