import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import { TransactionsIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import {
  NO_CATEGORY_LABEL,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/transaction-labels";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/finance/types";
import type { TransactionHistoryItem } from "@/lib/finance/transactions";
import { formatJalaliFromIso } from "@/lib/format";
import type { AccountOption } from "./create-transaction-form";
import { DeleteTransactionButton } from "./delete-transaction-button";

const TYPE_BADGE: Record<TransactionType, BadgeVariant> = {
  income: "success",
  expense: "danger",
};

const TYPE_AMOUNT_COLOR: Record<TransactionType, string> = {
  income: "text-success",
  expense: "text-danger",
};

const PAGINATION_LINK =
  "inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted";

const ACTION_LINK =
  "inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted";

export interface TransactionHistoryFiltersView {
  /** Empty string means "no filter" (all values). */
  type: string;
  accountId: string;
  from: string;
  to: string;
}

export interface TransactionHistoryViewProps {
  items: TransactionHistoryItem[];
  accounts: AccountOption[];
  filters: TransactionHistoryFiltersView;
  page: number;
  /** Link to the previous page, or null when already on the first page. */
  prevHref: string | null;
  /** Link to the next page, or null when there is nothing more to show. */
  nextHref: string | null;
  hasActiveFilters: boolean;
  /** Builds the edit link for a row, preserving the current filters and page. */
  editHrefFor: (transactionId: string) => string;
  /** Same-app path the user returns to after deleting a row. */
  deleteReturnTo: string;
  /** Optional success notice shown after a downstream edit. */
  savedMessage?: string;
}

/**
 * Presentational transaction-history view. It renders a plain GET filter form
 * (works without JavaScript), a results table and simple prev/next pagination.
 * It holds no session or data-fetching concerns so it can be unit tested.
 */
export function TransactionHistoryView({
  items,
  accounts,
  filters,
  page,
  prevHref,
  nextHref,
  hasActiveFilters,
  editHrefFor,
  deleteReturnTo,
  savedMessage,
}: TransactionHistoryViewProps) {
  const showOnboarding = !hasActiveFilters && page === 1;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">تراکنش‌ها</h1>
          <p className="text-sm text-muted-foreground">
            درآمدها و هزینه‌های ثبت‌شده خود را مرور کنید.
          </p>
        </div>
        <Link
          href="/transactions/new"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          افزودن تراکنش
        </Link>
      </header>

      {savedMessage && <Alert variant="success">{savedMessage}</Alert>}

      <Card>
        <CardContent>
          <form
            method="get"
            action="/transactions"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Field>
              <Label htmlFor="filter-type">نوع</Label>
              <Select id="filter-type" name="type" defaultValue={filters.type}>
                <option value="">همه</option>
                {TRANSACTION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {TRANSACTION_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label htmlFor="filter-account">حساب</Label>
              <Select
                id="filter-account"
                name="accountId"
                defaultValue={filters.accountId}
              >
                <option value="">همه حساب‌ها</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label htmlFor="filter-from">از تاریخ</Label>
              <Input
                id="filter-from"
                name="from"
                type="date"
                defaultValue={filters.from}
              />
            </Field>

            <Field>
              <Label htmlFor="filter-to">تا تاریخ</Label>
              <Input
                id="filter-to"
                name="to"
                type="date"
                defaultValue={filters.to}
              />
            </Field>

            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
              <Button type="submit">اعمال فیلتر</Button>
              {hasActiveFilters && (
                <Link href="/transactions" className={PAGINATION_LINK}>
                  پاک کردن
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        showOnboarding ? (
          <EmptyState
            icon={<TransactionsIcon width={24} height={24} />}
            title="هنوز تراکنشی ثبت نشده است"
            description="با ثبت اولین درآمد یا هزینه، تاریخچه مالی شما اینجا نمایش داده می‌شود."
            action={
              <Link
                href="/transactions/new"
                className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                افزودن تراکنش
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<TransactionsIcon width={24} height={24} />}
            title="تراکنشی مطابق فیلترها یافت نشد"
            description="فیلترها را تغییر دهید یا برای دیدن همه تراکنش‌ها آن‌ها را پاک کنید."
            action={
              <Link href="/transactions" className={PAGINATION_LINK}>
                نمایش همه تراکنش‌ها
              </Link>
            }
          />
        )
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table
              aria-label="فهرست تراکنش‌ها"
              className="w-full min-w-[46rem] border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    نوع
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    مبلغ
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    تاریخ
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    حساب
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    دسته‌بندی
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    توضیحات
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3">
                      <Badge variant={TYPE_BADGE[item.type]}>
                        {TRANSACTION_TYPE_LABELS[item.type]}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        "px-5 py-3 font-medium whitespace-nowrap",
                        TYPE_AMOUNT_COLOR[item.type],
                      )}
                    >
                      {formatTomanWithUnit(item.amount)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {formatJalaliFromIso(item.occurredOn)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {item.accountName}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {item.categoryName ?? NO_CATEGORY_LABEL}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {item.note || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={editHrefFor(item.id)}
                          className={ACTION_LINK}
                          aria-label="ویرایش تراکنش"
                        >
                          ویرایش
                        </Link>
                        <DeleteTransactionButton
                          transactionId={item.id}
                          returnTo={deleteReturnTo}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(prevHref || nextHref) && (
            <CardFooter className="justify-between">
              <span className="text-xs text-muted-foreground">
                صفحه {page}
              </span>
              <div className="flex items-center gap-2">
                {prevHref && (
                  <Link href={prevHref} rel="prev" className={PAGINATION_LINK}>
                    قبلی
                  </Link>
                )}
                {nextHref && (
                  <Link href={nextHref} rel="next" className={PAGINATION_LINK}>
                    بعدی
                  </Link>
                )}
              </div>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
}
