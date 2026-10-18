import Link from "next/link";
import { WalletIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CreateTransactionForm,
  type AccountOption,
  type CategoryOption,
} from "./create-transaction-form";

export interface TransactionsViewProps {
  /** Active (non-archived) accounts, eligible for new transactions. */
  accounts: AccountOption[];
  /**
   * True when the user owns at least one account, archived or not. Combined
   * with an empty `accounts` list it means "all accounts are archived".
   */
  hasAnyAccounts: boolean;
  categories: CategoryOption[];
  /** Gregorian `YYYY-MM-DD` used as the date field's initial value. */
  defaultDate: string;
}

/**
 * Presentational transaction-creation view. Kept free of session and data
 * concerns so it can be unit tested in isolation and streamed inside the
 * protected page.
 */
export function TransactionsView({
  accounts,
  hasAnyAccounts,
  categories,
  defaultDate,
}: TransactionsViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">تراکنش جدید</h1>
        <p className="text-sm text-muted-foreground">
          درآمد یا هزینه خود را ثبت کنید و آن را به یکی از حساب‌هایتان نسبت دهید.
        </p>
      </header>

      {accounts.length === 0 ? (
        hasAnyAccounts ? (
          <EmptyState
            icon={<WalletIcon width={24} height={24} />}
            title="همه حساب‌های شما بایگانی شده‌اند"
            description="برای ثبت تراکنش جدید، یک حساب را از بایگانی خارج کنید یا حساب تازه‌ای بسازید؛ تراکنش‌های قبلی حساب‌های بایگانی‌شده همچنان در دسترس‌اند."
            action={
              <Link
                href="/accounts"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                مدیریت حساب‌ها
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<WalletIcon width={24} height={24} />}
            title="برای ثبت تراکنش ابتدا یک حساب بسازید"
            description="تراکنش‌ها همیشه به یک حساب تعلق دارند؛ پس از ساخت اولین حساب می‌توانید درآمد و هزینه ثبت کنید."
            action={
              <Link
                href="/accounts"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                افزودن حساب
              </Link>
            }
          />
        )
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>ثبت تراکنش</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateTransactionForm
              accounts={accounts}
              categories={categories}
              defaultDate={defaultDate}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
