import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountsView } from "@/components/accounts/accounts-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";
import { getAccountBalances } from "@/lib/finance/dashboard";

export const metadata: Metadata = {
  title: "حساب‌ها",
};

async function AuthenticatedAccounts() {
  const userId = await requireUserId();
  const [accounts, balances] = await Promise.all([
    listAccounts(userId),
    getAccountBalances(userId),
  ]);

  const balanceById: Record<string, number> = {};
  for (const balance of balances) {
    balanceById[balance.id] = balance.balance;
  }

  return <AccountsView accounts={accounts} balanceById={balanceById} />;
}

function AccountsFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<AccountsFallback />}>
      <AuthenticatedAccounts />
    </Suspense>
  );
}
