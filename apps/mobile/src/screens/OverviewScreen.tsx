import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import type { MobileDashboardPeriod } from "@finora/shared";

import { useAuth } from "../auth/AuthContext.tsx";
import { AccountsCard } from "../components/overview/AccountsCard.tsx";
import { CategoriesCard } from "../components/overview/CategoriesCard.tsx";
import { SummaryCard } from "../components/overview/SummaryCard.tsx";
import { TransactionsCard } from "../components/overview/TransactionsCard.tsx";
import { SectionCard } from "../components/SectionCard.tsx";
import { AppText } from "../components/ui/AppText.tsx";
import { fetchMobileOverview, MobileApiError } from "../lib/api.ts";
import { mapMobileOverview, type Overview } from "../lib/overview.ts";
import { radius, spacing } from "../theme/tokens.ts";
import { useTheme } from "../theme/useTheme.ts";

const PERIODS: { value: MobileDashboardPeriod; label: string }[] = [
  { value: "this-month", label: "این ماه" },
  { value: "prev-month", label: "ماه قبل" },
  { value: "all-time", label: "کل" },
];

function EmptyCard({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <SectionCard title={title} subtitle="هنوز داده‌ای ثبت نشده است">
      <AppText style={[styles.emptyText, { color: colors.mutedForeground }]}>
        {body}
      </AppText>
    </SectionCard>
  );
}

export function OverviewScreen() {
  const { colors } = useTheme();
  const { session, signOutUnauthorized } = useAuth();
  const [period, setPeriod] = useState<MobileDashboardPeriod>("this-month");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!session) return;

    let active = true;

    void fetchMobileOverview(session.token, period)
      .then((response) => {
        if (active) setOverview(mapMobileOverview(response));
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof MobileApiError && caught.status === 401) {
          void signOutUnauthorized();
          return;
        }
        setError(
          caught instanceof MobileApiError
            ? caught.message
            : "دریافت اطلاعات انجام نشد. لطفاً دوباره تلاش کنید.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session, period, reloadKey, signOutUnauthorized]);

  function selectPeriod(next: MobileDashboardPeriod) {
    if (next === period) return;
    setLoading(true);
    setError(null);
    setOverview(null);
    setPeriod(next);
  }

  function retry() {
    setLoading(true);
    setError(null);
    setOverview(null);
    setReloadKey((value) => value + 1);
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <AppText
          weight="extraBold"
          style={[styles.title, { color: colors.foreground }]}
        >
          نمای کلی
        </AppText>
        <AppText style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {overview
            ? overview.summary.rangeLabel
            : "یک نگاه سریع به وضعیت مالی"}
        </AppText>
      </View>

      <View style={styles.periods}>
        {PERIODS.map((option) => {
          const selected = option.value === period;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => selectPeriod(option.value)}
              style={[
                styles.period,
                {
                  backgroundColor: selected
                    ? colors.primary
                    : colors.surfaceMuted,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <AppText
                weight="medium"
                style={[
                  styles.periodText,
                  {
                    color: selected
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  },
                ]}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {loading && (
        <View
          style={[
            styles.stateCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <ActivityIndicator color={colors.primary} />
          <AppText style={[styles.stateText, { color: colors.mutedForeground }]}>
            در حال دریافت اطلاعات…
          </AppText>
        </View>
      )}

      {!loading && error && (
        <View
          style={[
            styles.stateCard,
            {
              backgroundColor: colors.dangerSubtle,
              borderColor: colors.danger,
            },
          ]}
        >
          <AppText style={[styles.stateText, { color: colors.danger }]}>
            {error}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={[styles.retry, { borderColor: colors.danger }]}
          >
            <AppText weight="bold" style={{ color: colors.danger }}>
              تلاش دوباره
            </AppText>
          </Pressable>
        </View>
      )}

      {!loading && !error && overview && (
        <>
          <SummaryCard summary={overview.summary} />
          {overview.hasAccounts ? (
            <AccountsCard accounts={overview.accounts} />
          ) : (
            <EmptyCard
              title="حساب‌ها"
              body="برای دیدن موجودی، ابتدا یک حساب در نسخه وب بسازید."
            />
          )}
          {overview.categoryBreakdown.length > 0 ? (
            <CategoriesCard categories={overview.categoryBreakdown} />
          ) : (
            <EmptyCard
              title="دسته‌بندی هزینه‌ها"
              body="در این بازه هزینه‌ای ثبت نشده است."
            />
          )}
          {overview.recentTransactions.length > 0 ? (
            <TransactionsCard transactions={overview.recentTransactions} />
          ) : (
            <EmptyCard
              title="تراکنش‌های اخیر"
              body="در این بازه تراکنشی ثبت نشده است."
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 20,
  },
  heading: {
    gap: 2,
  },
  period: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  periodText: {
    fontSize: 11,
    lineHeight: 18,
  },
  periods: {
    flexDirection: "row-reverse",
    gap: spacing.sm,
  },
  retry: {
    alignSelf: "flex-start",
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  stateCard: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  stateText: {
    fontSize: 12,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 20,
  },
  title: {
    fontSize: 24,
    lineHeight: 34,
  },
});
