import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { radius, spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";
import { AppText } from "./ui/AppText.tsx";

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  children: ReactNode;
}

export function SectionCard({
  title,
  subtitle,
  trailing,
  children,
}: SectionCardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <AppText
            weight="bold"
            style={[styles.title, { color: colors.foreground }]}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {trailing}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row-reverse",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  heading: {
    flex: 1,
    gap: 2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 20,
  },
  title: {
    fontSize: 15,
    lineHeight: 24,
  },
});
