import { StyleSheet, View } from "react-native";

import { formatJalaliFromIso } from "../../lib/dates.ts";
import { formatSignedToman } from "../../lib/money.ts";
import type { OverviewTransaction } from "../../lib/overview.ts";
import { radius, spacing } from "../../theme/tokens.ts";
import { useTheme } from "../../theme/useTheme.ts";
import { SectionCard } from "../SectionCard.tsx";
import { AppText } from "../ui/AppText.tsx";
import { Icon } from "../ui/Icon.tsx";

export interface TransactionsCardProps {
  transactions: OverviewTransaction[];
}

export function TransactionsCard({ transactions }: TransactionsCardProps) {
  const { colors } = useTheme();

  return (
    <SectionCard
      title="تراکنش‌های اخیر"
      subtitle="پنج تراکنش آخر داده نمونه"
    >
      <View>
        {transactions.map((transaction, index) => {
          const income = transaction.kind === "income";
          const signedAmount = income
            ? transaction.amount
            : -transaction.amount;

          return (
            <View
              key={transaction.id}
              style={[
                styles.row,
                index > 0 && {
                  borderTopColor: colors.border,
                  borderTopWidth: 1,
                },
              ]}
            >
              <View
                style={[
                  styles.iconBox,
                  {
                    backgroundColor: income
                      ? colors.successSubtle
                      : colors.dangerSubtle,
                  },
                ]}
              >
                <Icon
                  name={income ? "arrow-up-outline" : "arrow-down-outline"}
                  size={18}
                  color={income ? colors.success : colors.danger}
                />
              </View>

              <View style={styles.info}>
                <AppText
                  weight="medium"
                  numberOfLines={1}
                  style={[styles.note, { color: colors.foreground }]}
                >
                  {transaction.note}
                </AppText>
                <AppText
                  numberOfLines={1}
                  style={[styles.meta, { color: colors.mutedForeground }]}
                >
                  {transaction.categoryName} · {transaction.accountName}
                </AppText>
              </View>

              <View style={styles.amountColumn}>
                <AppText
                  weight="bold"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    styles.amount,
                    {
                      color: income ? colors.success : colors.danger,
                    },
                  ]}
                >
                  {formatSignedToman(signedAmount)}
                </AppText>
                <AppText
                  style={[styles.date, { color: colors.mutedForeground }]}
                >
                  {formatJalaliFromIso(transaction.occurredOn)}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 12,
    lineHeight: 20,
  },
  amountColumn: {
    alignItems: "flex-start",
    gap: 1,
  },
  date: {
    fontSize: 10,
    lineHeight: 16,
  },
  iconBox: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  info: {
    flex: 1,
    gap: 1,
  },
  meta: {
    fontSize: 10,
    lineHeight: 18,
  },
  note: {
    fontSize: 12,
    lineHeight: 20,
  },
  row: {
    alignItems: "center",
    flexDirection: "row-reverse",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
});
