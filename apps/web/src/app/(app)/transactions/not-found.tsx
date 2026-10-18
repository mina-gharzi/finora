import Link from "next/link";
import { AlertIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * 404 for the transactions segment. It is rendered both when a requested
 * transaction is missing or owned by someone else and for any unmatched
 * `/transactions/...` URL, without leaking whether a record exists.
 */
export default function TransactionsNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-10">
      <EmptyState
        icon={<AlertIcon width={24} height={24} />}
        title="تراکنش موردنظر یافت نشد"
        description="این تراکنش وجود ندارد یا به حساب شما تعلق ندارد."
        action={
          <Link
            href="/transactions"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            بازگشت به تراکنش‌ها
          </Link>
        }
      />
    </div>
  );
}
