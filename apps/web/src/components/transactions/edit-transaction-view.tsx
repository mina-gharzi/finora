import Link from "next/link";
import { updateTransactionAction } from "@/app/actions/transactions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteTransactionButton } from "./delete-transaction-button";
import {
  TransactionForm,
  type AccountOption,
  type CategoryOption,
  type TransactionFormInitialValues,
} from "./transaction-form";

export interface EditTransactionViewProps {
  transactionId: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  initialValues: TransactionFormInitialValues;
  /** Same-app `/transactions` path used for cancel, save and delete. */
  returnHref: string;
}

/**
 * Presentational edit view. It reuses the shared transaction form (prefilled)
 * for updates and offers a guarded delete in a separate danger card. It holds no
 * session or data-fetching concerns, so it can be unit tested.
 */
export function EditTransactionView({
  transactionId,
  accounts,
  categories,
  initialValues,
  returnHref,
}: EditTransactionViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={returnHref}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          بازگشت به تراکنش‌ها
        </Link>
        <h1 className="text-2xl font-bold text-foreground">ویرایش تراکنش</h1>
        <p className="text-sm text-muted-foreground">
          مقادیر تراکنش را ویرایش کنید و تغییرات را ذخیره کنید.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات تراکنش</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionForm
            action={updateTransactionAction}
            accounts={accounts}
            categories={categories}
            initialValues={initialValues}
            submitLabel="ذخیره تغییرات"
            hiddenFields={{ transactionId, returnTo: returnHref }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حذف تراکنش</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            با حذف این تراکنش، رکورد آن برای همیشه پاک می‌شود.
          </p>
          <DeleteTransactionButton
            transactionId={transactionId}
            returnTo={returnHref}
            size="md"
          />
        </CardContent>
      </Card>
    </div>
  );
}
