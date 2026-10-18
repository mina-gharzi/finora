import { Suspense } from "react";
import type { Metadata } from "next";
import { TransactionHistoryView } from "@/components/transactions/transaction-history-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";
import {
  buildTransactionHistoryHref,
  hasActiveTransactionFilters,
  parseTransactionHistoryQuery,
  type TransactionHistorySearchParams,
} from "@/lib/finance/history-query";
import { listTransactionHistory } from "@/lib/finance/transactions";

export const metadata: Metadata = {
  title: "تراکنش‌ها",
};

type SearchParams = Promise<TransactionHistorySearchParams>;

async function AuthenticatedTransactionHistory({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await requireUserId();
  const query = parseTransactionHistoryQuery(await searchParams);

  const [accounts, history] = await Promise.all([
    listAccounts(userId),
    listTransactionHistory(userId, query),
  ]);

  return (
    <TransactionHistoryView
      items={history.items}
      accounts={accounts.map((account) => ({
        id: account.id,
        name: account.name,
      }))}
      filters={{
        type: query.type ?? "",
        accountId: query.accountId ?? "",
        from: query.from ?? "",
        to: query.to ?? "",
      }}
      page={history.page}
      prevHref={
        history.page > 1
          ? buildTransactionHistoryHref(query, history.page - 1)
          : null
      }
      nextHref={
        history.hasMore
          ? buildTransactionHistoryHref(query, history.page + 1)
          : null
      }
      hasActiveFilters={hasActiveTransactionFilters(query)}
    />
  );
}

function TransactionHistoryFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<TransactionHistoryFallback />}>
      <AuthenticatedTransactionHistory searchParams={searchParams} />
    </Suspense>
  );
}
