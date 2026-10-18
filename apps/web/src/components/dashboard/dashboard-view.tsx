import type { ReactNode } from "react";
import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CategoryIcon,
  InboxIcon,
  TransactionsIcon,
  WalletIcon,
} from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import {
  DASHBOARD_PERIODS,
  buildDashboardHref,
  dashboardPeriodLabel,
  type DashboardPeriod,
} from "@/lib/finance/dashboard-range";
import type {
  AccountBalance,
  CategoryExpenseSlice,
  DashboardTotals,
  RecentTransaction,
} from "@/lib/finance/dashboard";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/account-labels";
import {
  NO_CATEGORY_LABEL,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/transaction-labels";
import type { AccountType, TransactionType } from "@/lib/finance/types";
import { formatJalaliFromIso } from "@/lib/format";

/** Unicode minus (\u2212) so a negative amount is unambiguous, not just colour. */
const MINUS = "\u2212";

const ACCOUNT_TYPE_BADGE: Record<AccountType, BadgeVariant> = {
  cash: "success",
  bank: "info",
  wallet: "primary",
};

const TYPE_BADGE: Record<TransactionType, BadgeVariant> = {
  income: "success",
  expense: "danger",
};

const TYPE_AMOUNT_COLOR: Record<TransactionType, string> = {
  income: "text-success",
  expense: "text-danger",
};

const PERIOD_LINK =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors";

/** Formats a possibly-negative amount with an explicit sign. */
function formatSigned(amount: number): string {
  if (amount < 0) return `${MINUS}${formatTomanWithUnit(-amount)}`;
  if (amount > 0) return `+${formatTomanWithUnit(amount)}`;
  return formatTomanWithUnit(0);
}

/** Text label + badge for the net-cash-flow card (never colour alone). */
function netOutlook(net: number): { label: string; variant: BadgeVariant } {
  if (net > 0) return { label: "مازاد", variant: "success" };
  if (net < 0) return { label: "کسری", variant: "danger" };
  return { label: "بدون تغییر", variant: "neutral" };
}

export interface DashboardViewProps {
  period: DashboardPeriod;
  /** Resolved span label, e.g. "مهر 1405" or "همه زمان‌ها". */
  rangeLabel: string;
  totals: DashboardTotals;
  categoryBreakdown: CategoryExpenseSlice[];
  accountBalances: AccountBalance[];
  recentTransactions: RecentTransaction[];
  /** Whether the owner has any account at all. */
  hasAccounts: boolean;
  /** Whether the owner has any transaction at all. */
  hasTransactions: boolean;
}

/**
 * Presentational dashboard. It renders the period selector plus period-scoped
 * metrics (income, expense, net cash flow, category breakdown, recent
 * transactions) and a current account-balance panel that is explicitly labeled
 * as spanning full history rather than the selected period. It holds no session
 * or data-fetching concerns so it can be unit tested.
 */
export function DashboardView({
  period,
  rangeLabel,
  totals,
  categoryBreakdown,
  accountBalances,
  recentTransactions,
  hasAccounts,
  hasTransactions,
}: DashboardViewProps) {
  const outlook = netOutlook(totals.net);
  const expenseTotal = categoryBreakdown.reduce(
    (sum, slice) => sum + slice.amount,
    0,
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">داشبورد</h1>
          <p className="text-sm text-muted-foreground">
            نمای کلی وضعیت مالی شما بر پایه داده‌های ثبت‌شده.
          </p>
        </div>
        <Link
          href="/transactions/new"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          افزودن تراکنش
        </Link>
      </header>

      {!hasAccounts ? (
        <EmptyState
          icon={<WalletIcon width={24} height={24} />}
          title="برای شروع یک حساب بسازید"
          description="پس از ساخت حساب و ثبت اولین تراکنش، خلاصه درآمد، هزینه و موجودی حساب‌ها در این صفحه نمایش داده می‌شود."
          action={
            <Link
              href="/accounts"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              افزودن حساب
            </Link>
          }
        />
      ) : (
        <>
          <section
            aria-label="بازه زمانی"
            className="flex flex-col gap-2"
          >
            <nav
              aria-label="انتخاب بازه زمانی"
              className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-border bg-surface p-1"
            >
              {DASHBOARD_PERIODS.map((value) => {
                const active = value === period;
                return (
                  <Link
                    key={value}
                    href={buildDashboardHref(value)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      PERIOD_LINK,
                      active
                        ? "bg-primary-subtle text-primary"
                        : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    {dashboardPeriodLabel(value)}
                  </Link>
                );
              })}
            </nav>
            <p className="text-xs text-muted-foreground">بازه: {rangeLabel}</p>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="درآمد"
              amount={formatTomanWithUnit(totals.income)}
              amountClassName="text-success"
              icon={<ArrowUpIcon className="size-4" />}
            />
            <StatCard
              label="هزینه"
              amount={formatTomanWithUnit(totals.expense)}
              amountClassName="text-danger"
              icon={<ArrowDownIcon className="size-4" />}
            />
            <StatCard
              label="جریان نقدی خالص"
              amount={formatSigned(totals.net)}
              amountClassName={
                totals.net > 0
                  ? "text-success"
                  : totals.net < 0
                    ? "text-danger"
                    : "text-foreground"
              }
              badge={
                <Badge variant={outlook.variant}>{outlook.label}</Badge>
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>موجودی حساب‌ها</CardTitle>
              <CardDescription>
                بر پایه موجودی اولیه و تمام تراکنش‌های ثبت‌شده؛ مستقل از بازه
                زمانی انتخاب‌شده.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {accountBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  هنوز حسابی ثبت نشده است.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {accountBalances.map((account) => (
                    <li
                      key={account.id}
                      className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {account.name}
                        </span>
                        <Badge
                          variant={
                            ACCOUNT_TYPE_BADGE[account.type] ?? "neutral"
                          }
                        >
                          {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
                        </Badge>
                        {account.archived && (
                          <Badge variant="warning">بایگانی‌شده</Badge>
                        )}
                      </div>
                      <span className="shrink-0 font-medium text-foreground">
                        {formatSigned(account.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Link
                href="/accounts"
                className="text-sm font-medium text-primary hover:underline"
              >
                مدیریت حساب‌ها
              </Link>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>هزینه بر اساس دسته‌بندی</CardTitle>
              <CardDescription>در بازه {rangeLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryBreakdown.length === 0 ? (
                <EmptyState
                  icon={<CategoryIcon width={24} height={24} />}
                  title="در این بازه هزینه‌ای ثبت نشده است"
                  description="با ثبت هزینه یا تغییر بازه زمانی، تفکیک دسته‌بندی اینجا نمایش داده می‌شود."
                />
              ) : (
                <ul className="flex flex-col gap-3">
                  {categoryBreakdown.map((slice) => {
                    const percent =
                      expenseTotal > 0
                        ? Math.round((slice.amount / expenseTotal) * 100)
                        : 0;
                    return (
                      <li
                        key={slice.categoryId ?? "none"}
                        className="flex flex-col gap-1.5"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate text-foreground">
                            {slice.categoryName ?? NO_CATEGORY_LABEL}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                            {formatTomanWithUnit(slice.amount)}
                            <span className="mx-1 text-xs" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs">{percent}%</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${percent}%` }}
                            aria-hidden="true"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>تراکنش‌های اخیر</CardTitle>
              <CardDescription>در بازه {rangeLabel}</CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactions.length === 0 ? (
                hasTransactions ? (
                  <EmptyState
                    icon={<InboxIcon width={24} height={24} />}
                    title="در این بازه تراکنشی ثبت نشده است"
                    description="برای دیدن تراکنش‌های پیشین، بازه زمانی را به «همه زمان‌ها» تغییر دهید."
                    action={
                      <Link
                        href={buildDashboardHref("all-time")}
                        className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
                      >
                        نمایش همه تراکنش‌ها
                      </Link>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={<TransactionsIcon width={24} height={24} />}
                    title="هنوز تراکنشی ثبت نشده است"
                    description="با ثبت اولین درآمد یا هزینه، خلاصه مالی شما در این صفحه نمایش داده می‌شود."
                    action={
                      <Link
                        href="/transactions/new"
                        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
                      >
                        افزودن تراکنش
                      </Link>
                    }
                  />
                )
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {recentTransactions.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/transactions/${encodeURIComponent(item.id)}/edit`}
                        className="flex items-center justify-between gap-3 py-3 transition-colors first:pt-0 last:pb-0 hover:opacity-80"
                        aria-label={`جزئیات تراکنش ${item.accountName}`}
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant={TYPE_BADGE[item.type]}>
                              {TRANSACTION_TYPE_LABELS[item.type]}
                            </Badge>
                            <span className="truncate text-sm text-foreground">
                              {item.accountName}
                            </span>
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {item.categoryName ?? NO_CATEGORY_LABEL}
                            {" · "}
                            {formatJalaliFromIso(item.occurredOn)}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-medium whitespace-nowrap",
                            TYPE_AMOUNT_COLOR[item.type],
                          )}
                        >
                          {item.type === "income" ? "+" : MINUS}
                          {formatTomanWithUnit(item.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Link
                href="/transactions"
                className="text-sm font-medium text-primary hover:underline"
              >
                مشاهده همه تراکنش‌ها
              </Link>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  amount: string;
  amountClassName?: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

function StatCard({ label, amount, amountClassName, icon, badge }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {badge ?? (
            icon ? (
              <span className="text-muted-foreground" aria-hidden="true">
                {icon}
              </span>
            ) : null
          )}
        </div>
        <span className={cn("text-xl font-bold", amountClassName)}>
          {amount}
        </span>
      </CardContent>
    </Card>
  );
}
