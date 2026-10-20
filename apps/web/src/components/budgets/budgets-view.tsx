import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import { BudgetIcon, CategoryIcon } from "@/components/icons";
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
import {
  progressWidthPercent,
  type BudgetProgress,
  type BudgetSpendStatus,
} from "@/lib/finance/budget-status";
import type { BudgetCategoryOption, BudgetWithProgress } from "@/lib/finance/budgets";
import { BUDGETS_MONTH_PARAM } from "@/lib/finance/budgets-range";
import { CreateBudgetForm } from "./create-budget-form";
import { EditBudgetForm } from "./edit-budget-form";
import { DeleteBudgetButton } from "./delete-budget-button";

/** Unicode minus (\u2212) so an overspend amount is unambiguous, not just colour. */
const MINUS = "\u2212";

/** A month option for the selector. */
export interface BudgetMonthOption {
  /** `YYYY-MM` Jalali month param. */
  param: string;
  label: string;
}

export interface BudgetsViewProps {
  /** Recent months for the selector, newest first; includes `selectedParam`. */
  monthOptions: BudgetMonthOption[];
  /** The `YYYY-MM` param currently selected. */
  selectedParam: string;
  /** Selected month label, e.g. "مهر 1405". */
  monthLabel: string;
  /** Normalized first day of the selected month (`YYYY-MM-DD`). */
  monthStart: string;
  /** The owner's expense categories, for the create/edit selectors. */
  expenseCategories: BudgetCategoryOption[];
  /** The month's budgets with live progress. */
  budgets: BudgetWithProgress[];
  /** True when the owner has at least one expense category. */
  hasExpenseCategories: boolean;
}

/** Status bucket → Persian label and badge variant (text, never colour alone). */
const STATUS_LABELS: Record<BudgetSpendStatus, string> = {
  ok: "در محدوده بودجه",
  approaching: "نزدیک به سقف",
  reached: "به سقف رسید",
  exceeded: "از سقف گذشت",
};

const STATUS_VARIANTS: Record<BudgetSpendStatus, BadgeVariant> = {
  ok: "success",
  approaching: "warning",
  reached: "warning",
  exceeded: "danger",
};

/** Formats a possibly-negative integer Toman amount with an explicit sign. */
function formatSigned(amount: number): string {
  if (amount < 0) return `${MINUS}${formatTomanWithUnit(-amount)}`;
  return formatTomanWithUnit(amount);
}

/**
 * Presentational budgets page: a Jalali month selector, the month's budgets each
 * with a progress bar and a text status (in-range / approaching / reached /
 * exceeded), plus controls to create, edit and remove them. It holds no session
 * or data-fetching concerns so it can be unit tested; all figures arrive as
 * props computed server-side.
 *
 * Accessibility: the progress bar width is decorative (`aria-hidden`); every
 * budget carries its category name, limit, spending, remaining (or overspend)
 * and status as visible text, so status is never conveyed by colour alone.
 */
export function BudgetsView({
  monthOptions,
  selectedParam,
  monthLabel,
  monthStart,
  expenseCategories,
  budgets,
  hasExpenseCategories,
}: BudgetsViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">بودجه‌ها</h1>
        <p className="text-sm text-muted-foreground">
          برای دسته‌بندی‌های هزینه‌ای خود سقف ماهانه تعیین کنید و هزینه‌ها را با
          آن بسنجید.
        </p>
      </header>

      <section aria-label="انتخاب ماه بودجه" className="flex flex-col gap-2">
        <form
          method="get"
          action="/budgets"
          className="flex flex-wrap items-end gap-3"
        >
          <Field className="w-full sm:w-64">
            <Label htmlFor="budget-month">ماه بودجه</Label>
            <Select
              id="budget-month"
              name={BUDGETS_MONTH_PARAM}
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
      </section>

      {!hasExpenseCategories ? (
        <EmptyState
          icon={<CategoryIcon width={24} height={24} />}
          title="هنوز دسته‌بندی هزینه‌ای ندارید"
          description="برای تعیین بودجه، ابتدا یک دسته‌بندی هزینه‌ای بسازید."
          action={
            <Link
              href="/categories"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              مدیریت دسته‌بندی‌ها
            </Link>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>تعیین بودجه برای {monthLabel}</CardTitle>
              <CardDescription>
                برای هر دسته‌بندی در هر ماه یک بودجه ثبت می‌شود.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CreateBudgetForm
                categories={expenseCategories}
                monthStart={monthStart}
                monthLabel={monthLabel}
              />
            </CardContent>
          </Card>

          <section
            aria-labelledby="budgets-list-title"
            className="flex flex-col gap-3"
          >
            <h2
              id="budgets-list-title"
              className="text-lg font-semibold text-foreground"
            >
              بودجه‌های {monthLabel}
            </h2>

            {budgets.length === 0 ? (
              <EmptyState
                icon={<BudgetIcon width={24} height={24} />}
                title="برای این ماه بودجه‌ای ثبت نشده است"
                description="با فرم بالا اولین بودجه ماهانه خود را تعیین کنید."
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {budgets.map((budget) => (
                  <li key={budget.id}>
                    <BudgetCard
                      budget={budget}
                      monthStart={monthStart}
                      expenseCategories={expenseCategories}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function BudgetCard({
  budget,
  monthStart,
  expenseCategories,
}: {
  budget: BudgetWithProgress;
  monthStart: string;
  expenseCategories: BudgetCategoryOption[];
}) {
  const { progress } = budget;
  const width = progressWidthPercent(progress);
  const overspent = progress.status === "exceeded";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {budget.categoryName}
          </span>
          <Badge variant={STATUS_VARIANTS[progress.status]}>
            {STATUS_LABELS[progress.status]}
          </Badge>
          {budget.categoryArchived && (
            <Badge variant="neutral">دسته‌بندی بایگانی‌شده</Badge>
          )}
        </div>

        <BudgetProgressBar progress={progress} width={width} />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">سقف بودجه</dt>
            <dd className="font-medium text-foreground">
              {formatTomanWithUnit(progress.limit)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">هزینه‌شده</dt>
            <dd className="font-medium text-foreground">
              {formatTomanWithUnit(progress.spending)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">
              {overspent ? "بیش از سقف" : "باقی‌مانده"}
            </dt>
            <dd
              className={cn(
                "font-medium",
                overspent ? "text-danger" : "text-foreground",
              )}
            >
              {overspent
                ? formatSigned(-progress.overspend)
                : formatTomanWithUnit(progress.remaining)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
          <EditBudgetForm
            budgetId={budget.id}
            monthStart={monthStart}
            categoryId={budget.categoryId}
            limitAmount={budget.limitAmount}
            categories={expenseCategories}
          />
          <DeleteBudgetButton
            budgetId={budget.id}
            categoryName={budget.categoryName}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The progress indicator for one budget. The bar is a decorative visual; the
 * accessible description states the exact status in words so the same
 * information is available without reading pixel widths.
 */
function BudgetProgressBar({
  progress,
  width,
}: {
  progress: BudgetProgress;
  width: number;
}) {
  const roundedPercent = Math.round(progress.percent);
  return (
    <div
      className="flex flex-col gap-1"
      role="group"
      aria-label={`وضعیت بودجه: ${STATUS_LABELS[progress.status]}`}
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className={cn(
            "h-full rounded-full",
            progress.status === "exceeded"
              ? "bg-danger"
              : progress.status === "ok"
                ? "bg-success"
                : "bg-warning",
          )}
          style={{ width: `${width}%` }}
          aria-hidden="true"
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {roundedPercent}% از سقف مصرف شده است
        {progress.status === "exceeded" && progress.overspend > 0
          ? `؛ ${formatTomanWithUnit(progress.overspend)} بیش از سقف`
          : ""}
      </span>
    </div>
  );
}
