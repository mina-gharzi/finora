import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountsView } from "@/components/accounts/accounts-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";

export const metadata: Metadata = {
  title: "حساب‌ها",
};

async function AuthenticatedAccounts() {
  const userId = await requireUserId();
  const accounts = await listAccounts(userId);
  return <AccountsView accounts={accounts} />;
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
