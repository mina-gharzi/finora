import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditTransactionView } from "@/components/transactions/edit-transaction-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";
import { listCategories } from "@/lib/finance/categories";
import {
  parseTransactionReturnTo,
  type TransactionHistorySearchParams,
} from "@/lib/finance/history-query";
import { findTransactionForUser } from "@/lib/finance/transactions";
import type { TransactionType } from "@/lib/finance/types";
import { transactionIdSchema } from "@/lib/finance/validation";

export const metadata: Metadata = {
  title: "ویرایش تراکنش",
};

/**
 * This route reads a URL parameter, so its shell cannot be prerendered ahead of
 * the request; the shared app shell calls `usePathname()` for active-nav state.
 * Allowing the route to block is the supported escape hatch (see the Next.js
 * `instant` segment config) and keeps the page correct for every id.
 */
export const instant = false;

type Params = Promise<{ transactionId: string }>;
type SearchParams = Promise<TransactionHistorySearchParams>;

async function AuthenticatedEditTransaction({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const userId = await requireUserId();
  const { transactionId } = await params;

  // A malformed id is indistinguishable from a missing or foreign one: all
  // three render the segment's not-found UI rather than revealing existence.
  if (!transactionIdSchema.safeParse(transactionId).success) {
    notFound();
  }

  const transaction = await findTransactionForUser(transactionId, userId);
  if (!transaction) {
    notFound();
  }

  const [accounts, categories] = await Promise.all([
    listAccounts(userId),
    listCategories(userId),
  ]);

  const returnHref = parseTransactionReturnTo((await searchParams).returnTo);

  return (
    <EditTransactionView
      transactionId={transaction.id}
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
      }))}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind as TransactionType,
      }))}
      initialValues={{
        type: transaction.type as TransactionType,
        amountText: String(transaction.amount),
        occurredOn: transaction.occurredOn,
        accountId: transaction.accountId,
        categoryId: transaction.categoryId ?? "",
        note: transaction.note,
      }}
      returnHref={returnHref}
    />
  );
}

function EditTransactionFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function EditTransactionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<EditTransactionFallback />}>
      <AuthenticatedEditTransaction params={params} searchParams={searchParams} />
    </Suspense>
  );
}
