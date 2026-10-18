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

  const [allAccounts, categories] = await Promise.all([
    listAccounts(userId),
    listCategories(userId),
  ]);

  // Active accounts are the eligible options. If this transaction already sits
  // on an archived account, that account is included (badged) so the row stays
  // editable in place — but no *other* archived account is offered, and the
  // server rejects any attempt to move a transaction onto one.
  const activeAccounts = allAccounts.filter((account) => !account.archived);
  const currentAccount = allAccounts.find(
    (account) => account.id === transaction.accountId,
  );
  const accountOptions =
    currentAccount && currentAccount.archived
      ? [
          {
            id: currentAccount.id,
            name: `${currentAccount.name} (بایگانی‌شده)`,
            archived: true as const,
          },
          ...activeAccounts.map((account) => ({
            id: account.id,
            name: account.name,
          })),
        ]
      : activeAccounts.map((account) => ({
          id: account.id,
          name: account.name,
        }));

  const returnHref = parseTransactionReturnTo((await searchParams).returnTo);

  return (
    <EditTransactionView
      transactionId={transaction.id}
      accounts={accountOptions}
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
