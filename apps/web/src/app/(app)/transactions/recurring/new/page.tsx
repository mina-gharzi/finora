import { Suspense } from "react";
import type { Metadata } from "next";
import {
  CreateRecurringForm,
  type AccountOption,
  type CategoryOption,
} from "@/components/recurring/create-recurring-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";
import { listCategories } from "@/lib/finance/categories";
import { todayInTehranIso } from "@/lib/finance/today";
import type { TransactionType } from "@/lib/finance/types";

export const metadata: Metadata = {
  title: "قانون تکرارشونده جدید",
};

async function AuthenticatedRecurringForm() {
  const userId = await requireUserId();
  const [allAccounts, allCategories] = await Promise.all([
    listAccounts(userId),
    listCategories(userId),
  ]);

  // Archived records stay on historical rows but are never selectable for a
  // NEW rule (the server rejects them too).
  const accounts: AccountOption[] = allAccounts
    .filter((account) => !account.archived)
    .map((account) => ({ id: account.id, name: account.name }));
  const categories: CategoryOption[] = allCategories
    .filter((category) => !category.archived)
    .map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind as TransactionType,
    }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">
          قانون تکرارشونده جدید
        </h1>
        <p className="text-sm text-muted-foreground">
          درآمد یا هزینه‌ای را تعیین کنید تا در تاریخ‌های مشخص به‌صورت خودکار
          ثبت شود.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ثبت قانون</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateRecurringForm
            accounts={accounts}
            categories={categories}
            defaultDate={todayInTehranIso()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function RecurringFormFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function NewRecurringPage() {
  return (
    <Suspense fallback={<RecurringFormFallback />}>
      <AuthenticatedRecurringForm />
    </Suspense>
  );
}
