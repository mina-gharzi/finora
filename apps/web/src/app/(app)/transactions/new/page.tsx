import { Suspense } from "react";
import type { Metadata } from "next";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";
import { listCategories } from "@/lib/finance/categories";
import type { TransactionType } from "@/lib/finance/types";

export const metadata: Metadata = {
  title: "تراکنش جدید",
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function AuthenticatedTransactionForm() {
  const userId = await requireUserId();
  const [allAccounts, allCategories] = await Promise.all([
    listAccounts(userId),
    listCategories(userId),
  ]);

  // Archived accounts are never offered for new transactions (the server
  // rejects them too); the unfiltered list is only used to tell "no accounts
  // at all" apart from "all accounts archived".
  const accounts = allAccounts.filter((account) => !account.archived);
  // Archived categories follow the same rule: they stay on historical rows but
  // are never selectable for a NEW transaction (the server rejects them too).
  const categories = allCategories.filter((category) => !category.archived);

  return (
    <TransactionsView
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
      }))}
      hasAnyAccounts={allAccounts.length > 0}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind as TransactionType,
      }))}
      defaultDate={todayIsoDate()}
    />
  );
}

function TransactionsFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function NewTransactionPage() {
  return (
    <Suspense fallback={<TransactionsFallback />}>
      <AuthenticatedTransactionForm />
    </Suspense>
  );
}
