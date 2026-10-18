import type { ReactNode } from "react";
import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CategoryIcon,
  ReportsIcon,
} from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { CategoryExpenseSlice } from "@/lib/finance/dashboard";
import type {
  MetricChange,
  PeriodComparison,
  PeriodTotals,
} from "@/lib/finance/report-math";
import type { ReportsTrendPoint } from "@/lib/finance/reports";
import { REPORTS_MONTH_PARAM } from "@/lib/finance/reports-range";
import { NO_CATEGORY_LABEL } from "@/lib/finance/transaction-labels";

/** Unicode minus (\u2212) so a negative amount is unambiguous, not just colour. */
const MINUS = "\u2212";

/** Formats a possibly-negative amount with an explicit sign. */
function formatSigned(amount: number): string {
  if (amount < 0) return `${MINUS}${formatTomanWithUnit(-amount)}`;
  if (amount > 0) return `+${formatTomanWithUnit(amount)}`;
  return formatTomanWithUnit(0);
}

/** Formats a possibly-negative whole percent with an explicit sign. */
function formatSignedPercent(percent: number): string {
  if (percent < 0) return `${MINUS}${Math.abs(percent)}%`;
  if (percent > 0) return `+${percent}%`;
  return "0%";
}

/** Direction of a month-over-month change, as text — never colour alone. */
function changeDirection(change: MetricChange): {
  label: string;
  variant: BadgeVariant;
} {
  if (change.delta > 0) return { label: "افزایش", variant: "info" };
  if (change.delta < 0) return { label: "کاهش", variant: "neutral" };
  return { label: "بدون تغییر", variant: "neutral" };
}

export interface ReportsMonthOption {
  /** `YYYY-MM` Jalali month param. */
  param: string;
  label: string;
}

export interface ReportsViewProps {
  /** Recent months for the selector, newest first; includes `selectedParam`. */
  monthOptions: ReportsMonthOption[];
  /** The `YYYY-MM` param currently selected. */
  selectedParam: string;
  /** Selected month label, e.g. "مهر 1405". */
  monthLabel: string;
  /** Inclusive Gregorian bounds rendered in Jalali, e.g. "1405/07/01 تا …". */
  rangeLabel: string;
  /** Previous Jalali month label, e.g. "شهریور 1405". */
  previousLabel: string;
  totals: PeriodTotals;
  comparison: PeriodComparison;
  /** Six consecutive months, oldest first, ending at the selected month. */
  trend: ReportsTrendPoint[];
  categoryBreakdown: CategoryExpenseSlice[];
  /** Whether the owner has at least one transaction in total. */
  hasTransactions: boolean;
}

/**
 * Presentational reports page: a Jalali month selector, a month-over-month
 * comparison of income/expense/net against the previous Jalali month, a
 * six-month CSS bar trend, and the selected month's expense breakdown by
 * category. It holds no session or data-fetching concerns so it can be unit
 * tested; all aggregates arrive as props computed server-side.
 *
 * Chart accessibility: bar widths are decorative (`aria-hidden`); every bar
 * carries its month, direction ("درآمد"/"هزینه") and exact amount as visible
 * text, so the data is fully available without reading pixel widths, and the
 * two directions are distinguished by text labels and arrow icons, never by
 * colour alone. All bars in the trend share one scale (the window's maximum),
 * so widths are comparable across months; zero and missing months render as
 * zero-width bars with an explicit "0 تومان" amount.
 */
export function ReportsView({
  monthOptions,
  selectedParam,
  monthLabel,
  rangeLabel,
  previousLabel,
  totals,
  comparison,
  trend,
  categoryBreakdown,
  hasTransactions,
}: ReportsViewProps) {
  const expenseTotal = categoryBreakdown.reduce(
    (sum, slice) => sum + slice.amount,
    0,
  );
  const monthIsEmpty =
    totals.income === 0 && totals.expense === 0;
  // One shared scale for every bar in the trend window, so widths are
  // comparable across months.
  const trendMax = trend.reduce(
    (max, point) => Math.max(max, point.income, point.expense),
    0,
  );

  if (!hasTransactions) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">گزارش‌ها</h1>
          <p className="text-sm text-muted-foreground">
            تحلیل درآمد، هزینه و جریان نقدی بر پایه تراکنش‌های ثبت‌شده.
          </p>
        </header>
        <EmptyState
          icon={<ReportsIcon width={24} height={24} />}
          title="هنوز تراکنشی ثبت نشده است"
          description="با ثبت اولین درآمد یا هزینه، گزارش ماهانه و روند شش‌ماهه شما در این صفحه نمایش داده می‌شود."
          action={
            <Link
              href="/transactions/new"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              افزودن تراکنش
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">گزارش‌ها</h1>
          <p className="text-sm text-muted-foreground">
            تحلیل درآمد، هزینه و جریان نقدی بر پایه تراکنش‌های ثبت‌شده.
          </p>
        </div>
        <Link
          href="/transactions/new"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          افزودن تراکنش
        </Link>
      </header>

      <section aria-label="انتخاب ماه گزارش" className="flex flex-col gap-2">
        <form
          method="get"
          action="/reports"
          className="flex flex-wrap items-end gap-3"
        >
          <Field className="w-full sm:w-64">
            <Label htmlFor="report-month">ماه گزارش</Label>
            <Select
              id="report-month"
              name={REPORTS_MONTH_PARAM}
              defaultValue={selectedParam}
            >
              {monthOptions.map((option) => (
                <option key={option.param} value={option.param}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">نمایش</Button>
        </form>
        <p className="text-xs text-muted-foreground">بازه: {rangeLabel}</p>
        {monthIsEmpty && (
          <p className="text-xs text-muted-foreground">
            در این ماه تراکنشی ثبت نشده است؛ مقادیر صفر نمایش داده می‌شود.
          </p>
        )}
      </section>

      <section aria-label={`مقایسه ${monthLabel} با ${previousLabel}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <ComparisonCard
            label="درآمد"
            icon={<ArrowUpIcon className="size-4" />}
            amountClassName="text-success"
            change={comparison.income}
            previousLabel={previousLabel}
          />
          <ComparisonCard
            label="هزینه"
            icon={<ArrowDownIcon className="size-4" />}
            amountClassName="text-danger"
            change={comparison.expense}
            previousLabel={previousLabel}
          />
          <ComparisonCard
            label="جریان نقدی خالص"
            amount={formatSigned(totals.net)}
            amountClassName={
              totals.net > 0
                ? "text-success"
                : totals.net < 0
                  ? "text-danger"
                  : "text-foreground"
            }
            change={comparison.net}
            previousLabel={previousLabel}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>روند ماهانه</CardTitle>
          <CardDescription>
            درآمد و هزینه شش ماه منتهی به {monthLabel}؛ طول میله‌ها نسبت به
            بیشترین مقدار این بازه مقیاس‌بندی شده است.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-5">
            {trend.map((point) => (
              <li key={point.param} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">
                    {point.label}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    خالص {formatSigned(point.net)}
                  </span>
                </div>
                <TrendBar
                  directionLabel="درآمد"
                  amount={point.income}
                  max={trendMax}
                  fillClassName="bg-success"
                  icon={<ArrowUpIcon className="size-3.5" />}
                />
                <TrendBar
                  directionLabel="هزینه"
                  amount={point.expense}
                  max={trendMax}
                  fillClassName="bg-danger"
                  icon={<ArrowDownIcon className="size-3.5" />}
                />
              </li>
            ))}
          </ul>
          {trendMax === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              در این بازه شش‌ماهه تراکنشی ثبت نشده است.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>هزینه بر اساس دسته‌بندی</CardTitle>
          <CardDescription>در ماه {monthLabel}</CardDescription>
        </CardHeader>
        <CardContent>
          {categoryBreakdown.length === 0 ? (
            <EmptyState
              icon={<CategoryIcon width={24} height={24} />}
              title="در این ماه هزینه‌ای ثبت نشده است"
              description="با ثبت هزینه یا انتخاب ماه دیگری، تفکیک دسته‌بندی اینجا نمایش داده می‌شود."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {categoryBreakdown.map((slice, index) => {
                const percent =
                  expenseTotal > 0
                    ? Math.round((slice.amount / expenseTotal) * 100)
                    : 0;
                const isLargest = index === 0 && slice.amount > 0;
                return (
                  <li
                    key={slice.categoryId ?? "none"}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-foreground">
                          {slice.categoryName ?? NO_CATEGORY_LABEL}
                        </span>
                        {isLargest && (
                          <Badge variant="primary">بزرگ‌ترین</Badge>
                        )}
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

      <p className="text-xs text-muted-foreground">
        گزارش‌ها فقط تراکنش‌های ثبت‌شده را در بازه انتخاب‌شده خلاصه می‌کنند؛
        موجودی اولیه حساب‌ها در درآمد، هزینه و جریان نقدی لحاظ نمی‌شود.
        {" "}
        <Link href="/transactions" className="font-medium text-primary hover:underline">
          مشاهده همه تراکنش‌ها
        </Link>
      </p>
    </div>
  );
}

interface ComparisonCardProps {
  label: string;
  icon?: ReactNode;
  /** Pre-formatted amount; overrides the default `change.current` formatting (for signed net). */
  amount?: string;
  amountClassName?: string;
  change: MetricChange;
  previousLabel: string;
}

function ComparisonCard({
  label,
  icon,
  amount,
  amountClassName,
  change,
  previousLabel,
}: ComparisonCardProps) {
  const direction = changeDirection(change);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon ? (
            <span className="text-muted-foreground" aria-hidden="true">
              {icon}
            </span>
          ) : null}
        </div>
        <span className={cn("text-xl font-bold", amountClassName)}>
          {amount ?? formatTomanWithUnit(change.current)}
        </span>
        <span className="text-xs text-muted-foreground">
          {previousLabel}: {formatSigned(change.previous)}
        </span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={direction.variant}>{direction.label}</Badge>
          <span className="text-muted-foreground">
            {formatSigned(change.delta)}
          </span>
          {change.percent === null ? (
            <span className="text-muted-foreground" title="ماه قبل مقدار صفر یا منفی داشته است؛ درصد تغییر قابل محاسبه نیست.">
              درصد: ناموجود
            </span>
          ) : (
            <span className="text-muted-foreground">
              ({formatSignedPercent(change.percent)})
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TrendBarProps {
  directionLabel: string;
  amount: number;
  max: number;
  fillClassName: string;
  icon: ReactNode;
}

/**
 * One direction's bar for one month. The bar width is decorative; the
 * direction label and exact amount are always visible text.
 */
function TrendBar({
  directionLabel,
  amount,
  max,
  fillClassName,
  icon,
}: TrendBarProps) {
  const percent = max > 0 ? (amount / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-20 shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        {directionLabel}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn("h-full rounded-full", fillClassName)}
          style={{ width: `${percent}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="w-28 shrink-0 text-left text-xs text-muted-foreground">
        {formatTomanWithUnit(amount)}
      </span>
    </div>
  );
}
