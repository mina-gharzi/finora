import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateTransferForm } from "@/components/transfers/create-transfer-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listAccounts } from "@/lib/finance/accounts";
import { todayInTehranIso } from "@/lib/finance/today";

export const metadata: Metadata = {
  title: "انتقال جدید",
};

async function AuthenticatedTransferForm() {
  const userId = await requireUserId();
  const allAccounts = await listAccounts(userId);

  // Archived accounts are never offered for a new transfer (the server rejects
  // them too).
  const accounts = allAccounts.filter((account) => !account.archived);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">انتقال جدید</h1>
        <p className="text-sm text-muted-foreground">
          مبلغی را از یکی از حساب‌های خود به حساب دیگر منتقل کنید.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>ثبت انتقال</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTransferForm
            accounts={accounts.map((account) => ({
              id: account.id,
              name: account.name,
            }))}
            defaultDate={todayInTehranIso()}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TransferFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function NewTransferPage() {
  return (
    <Suspense fallback={<TransferFallback />}>
      <AuthenticatedTransferForm />
    </Suspense>
  );
}
