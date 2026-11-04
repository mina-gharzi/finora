import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import { TransactionsIcon } from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { describeRecurrence } from "@/lib/finance/recurring-labels";
import {
  NO_CATEGORY_LABEL,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/transaction-labels";
import type { RecurringListItem } from "@/lib/finance/recurring";
import type { TransactionType } from "@/lib/finance/types";
import { formatJalaliFromIso } from "@/lib/format";
import { DeleteRecurringButton } from "./delete-recurring-button";
import { ToggleRecurringButton } from "./toggle-recurring-button";

const TYPE_BADGE: Record<TransactionType, BadgeVariant> = {
  income: "success",
  expense: "danger",
};

const TYPE_AMOUNT_COLOR: Record<TransactionType, string> = {
  income: "text-success",
  expense: "text-danger",
};

const HEADER_LINK =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted";

const PRIMARY_LINK =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover";

export interface RecurringViewProps {
  rules: RecurringListItem[];
}

/**
 * Presentational list of the user's recurring rules. Kept free of session and
 * data-access concerns so it can be unit tested in isolation.
 */
export function RecurringView({ rules }: RecurringViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">
            تراکنش‌های تکرارشونده
          </h1>
          <p className="text-sm text-muted-foreground">
            قوانین درآمد و هزینه‌ای که به‌صورت خودکار ثبت می‌شوند را مدیریت کنید.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <Link href="/transactions" className={HEADER_LINK}>
            فهرست تراکنش‌ها
          </Link>
          <Link href="/transactions/recurring/new" className={PRIMARY_LINK}>
            قانون جدید
          </Link>
        </div>
      </header>

      {rules.length === 0 ? (
        <EmptyState
          icon={<TransactionsIcon width={24} height={24} />}
          title="هنوز قانون تکرارشونده‌ای ندارید"
          description="برای ثبت خودکار درآمد یا هزینه‌های دوره‌ای، اولین قانون خود را بسازید."
          action={
            <Link href="/transactions/recurring/new" className={PRIMARY_LINK}>
              ساخت قانون
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rules.map((rule) => (
            <li key={rule.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={TYPE_BADGE[rule.type]}>
                        {TRANSACTION_TYPE_LABELS[rule.type]}
                      </Badge>
                      <Badge variant={rule.active ? "success" : "neutral"}>
                        {rule.active ? "فعال" : "متوقف"}
                      </Badge>
                    </span>
                    <span
                      className={cn(
                        "text-sm font-semibold whitespace-nowrap",
                        TYPE_AMOUNT_COLOR[rule.type],
                      )}
                    >
                      {formatTomanWithUnit(rule.amount)}
                    </span>
                  </div>

                  <p className="text-sm text-foreground">
                    {describeRecurrence(rule)}
                  </p>

                  {rule.note && (
                    <p className="text-sm text-muted-foreground">{rule.note}</p>
                  )}

                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <dt>حساب:</dt>
                      <dd className="text-foreground">{rule.accountName}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt>دسته‌بندی:</dt>
                      <dd className="text-foreground">
                        {rule.categoryName ?? NO_CATEGORY_LABEL}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt>شروع:</dt>
                      <dd className="text-foreground">
                        {formatJalaliFromIso(rule.startOn)}
                      </dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <dt>پایان:</dt>
                      <dd className="text-foreground">
                        {rule.endOn
                          ? formatJalaliFromIso(rule.endOn)
                          : "بدون پایان"}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-start gap-2">
                    <ToggleRecurringButton
                      recurringId={rule.id}
                      active={rule.active}
                    />
                    <DeleteRecurringButton recurringId={rule.id} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
