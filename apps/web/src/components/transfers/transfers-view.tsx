import Link from "next/link";
import { formatTomanWithUnit } from "@finora/shared";
import { WalletIcon } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { TransferListItem } from "@/lib/finance/transfers";
import { formatJalaliFromIso } from "@/lib/format";
import { DeleteTransferButton } from "./delete-transfer-button";

const HEADER_LINK =
  "inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted";

const NEW_LINK =
  "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover";

export interface TransfersViewProps {
  transfers: TransferListItem[];
}

/**
 * Presentational transfer list. It holds no session or data-fetching concerns so
 * it can be unit tested in isolation and streamed inside the protected page.
 */
export function TransfersView({ transfers }: TransfersViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">
            انتقال بین حساب‌ها
          </h1>
          <p className="text-sm text-muted-foreground">
            جابه‌جایی پول بین حساب‌های خود را مرور کنید.
          </p>
        </div>
        <Link href="/accounts/transfers/new" className={HEADER_LINK}>
          انتقال جدید
        </Link>
      </header>

      {transfers.length === 0 ? (
        <EmptyState
          icon={<WalletIcon width={24} height={24} />}
          title="هنوز انتقالی ثبت نکرده‌اید"
          description="با ثبت اولین انتقال، جابه‌جایی پول بین حساب‌های شما اینجا نمایش داده می‌شود."
          action={
            <Link href="/accounts/transfers/new" className={NEW_LINK}>
              انتقال جدید
            </Link>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table
              aria-label="فهرست انتقال‌ها"
              className="w-full min-w-[46rem] border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-border text-start text-xs text-muted-foreground">
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    مسیر انتقال
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    مبلغ
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    تاریخ
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    توضیحات
                  </th>
                  <th scope="col" className="px-5 py-3 text-start font-medium">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((transfer) => (
                  <tr
                    key={transfer.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-5 py-3 text-muted-foreground">
                      <span className="whitespace-nowrap">
                        {transfer.fromAccountName} ← {transfer.toAccountName}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium whitespace-nowrap text-foreground">
                      {formatTomanWithUnit(transfer.amount)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-muted-foreground">
                      {formatJalaliFromIso(transfer.occurredOn)}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {transfer.note || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <DeleteTransferButton transferId={transfer.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
