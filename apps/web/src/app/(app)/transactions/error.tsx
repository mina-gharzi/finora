"use client";

import { useEffect } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Failure state for the transactions segment (history and creation). A thrown
 * error while loading the account/transaction data is shown here with a retry
 * action instead of a blank screen or a generic framework overlay.
 */
export default function TransactionsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-10">
      <Alert variant="danger" title="بارگذاری تراکنش‌ها ناموفق بود">
        دریافت اطلاعات تراکنش‌ها با خطا مواجه شد. لطفاً دوباره تلاش کنید.
      </Alert>
      <Button onClick={() => retry()} className="self-start">
        تلاش مجدد
      </Button>
    </div>
  );
}
