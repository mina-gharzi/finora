import { Suspense } from "react";
import type { Metadata } from "next";
import { RecurringView } from "@/components/recurring/recurring-view";
import { Spinner } from "@/components/ui/spinner";
import { ensureRecurringFresh, requireUserId } from "@/lib/dal";
import { listRecurring } from "@/lib/finance/recurring";

export const metadata: Metadata = {
  title: "تراکنش‌های تکرارشونده",
};

async function AuthenticatedRecurring() {
  const userId = await requireUserId();
  await ensureRecurringFresh(userId);
  const rules = await listRecurring(userId);

  return <RecurringView rules={rules} />;
}

function RecurringFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function RecurringPage() {
  return (
    <Suspense fallback={<RecurringFallback />}>
      <AuthenticatedRecurring />
    </Suspense>
  );
}
