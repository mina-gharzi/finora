import { formatTomanWithUnit } from "@finora/shared";
import { StyleSheet, View } from "react-native";

import type { FixtureAccountKind } from "../../data/fixtures.ts";
import type { OverviewAccount } from "../../lib/overview.ts";
import { radius, spacing } from "../../theme/tokens.ts";
import { useTheme } from "../../theme/useTheme.ts";
import { SectionCard } from "../SectionCard.tsx";
import { AppText } from "../ui/AppText.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";

const ACCOUNT_ICONS: Record<FixtureAccountKind, IconName> = {
  cash: "cash-outline",
  bank: "business-outline",
  wallet: "wallet-outline",
};

export interface AccountsCardProps {
  accounts: OverviewAccount[];
}

export function AccountsCard({ accounts }: AccountsCardProps) {
  const { colors } = useTheme();

  return (
    <SectionCard
      title="حساب‌ها"
      subtitle={`${accounts.length} حساب در داده نمونه`}
    >
      <View>
        {accounts.map((account, index) => (
          <View
            key={account.id}
            style={[
              styles.row,
              index > 0 && {
                borderTopColor: colors.border,
                borderTopWidth: 1,
              },
            ]}
          >
            <View
              style={[styles.iconBox, { backgroundColor: colors.surfaceMuted }]}
            >
              <Icon
                name={ACCOUNT_ICONS[account.kind]}
                size={18}
                color={colors.primary}
              />
            </View>

            <View style={styles.info}>
              <AppText
                weight="medium"
                style={[styles.name, { color: colors.foreground }]}
              >
                {account.name}
              </AppText>
              <AppText
                style={[styles.kind, { color: colors.mutedForeground }]}
              >
                {account.kindLabel}
              </AppText>
            </View>

            <AppText
              weight="bold"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.amount, { color: colors.foreground }]}
            >
              {formatTomanWithUnit(account.balance)}
            </AppText>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 13,
    lineHeight: 22,
  },
  iconBox: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  kind: {
    fontSize: 11,
    lineHeight: 18,
  },
  name: {
    fontSize: 13,
    lineHeight: 22,
  },
  row: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
});
