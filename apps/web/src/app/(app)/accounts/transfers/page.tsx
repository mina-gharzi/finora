import { Suspense } from "react";
import type { Metadata } from "next";
import { TransfersView } from "@/components/transfers/transfers-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listTransfers } from "@/lib/finance/transfers";

export const metadata: Metadata = {
  title: "انتقال بین حساب‌ها",
};

const TRANSFERS_PAGE_LIMIT = 50;

async function AuthenticatedTransfers() {
  const userId = await requireUserId();
  const transfers = await listTransfers(userId, TRANSFERS_PAGE_LIMIT);

  return <TransfersView transfers={transfers} />;
}

function TransfersFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense fallback={<TransfersFallback />}>
      <AuthenticatedTransfers />
    </Suspense>
  );
}
