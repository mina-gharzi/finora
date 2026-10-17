import { formatTomanWithUnit } from "@finora/shared";
import { WalletIcon } from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/account-labels";
import type { AccountType } from "@/lib/finance/types";
import type { AccountRow } from "@/db/schema";
import { CreateAccountForm } from "./create-account-form";
import { DeleteAccountButton } from "./delete-account-button";

const TYPE_BADGE: Record<AccountType, BadgeVariant> = {
  cash: "success",
  bank: "info",
  wallet: "primary",
};

function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABELS[type as AccountType] ?? type;
}

function accountTypeBadge(type: string): BadgeVariant {
  return TYPE_BADGE[type as AccountType] ?? "neutral";
}

export function AccountsView({ accounts }: { accounts: AccountRow[] }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">حساب‌ها</h1>
        <p className="text-sm text-muted-foreground">
          حساب‌های نقدی، بانکی و کیف پول خود را مدیریت کنید.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>افزودن حساب</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateAccountForm />
        </CardContent>
      </Card>

      <section aria-labelledby="accounts-list-title" className="flex flex-col gap-3">
        <h2 id="accounts-list-title" className="text-lg font-semibold text-foreground">
          حساب‌های شما
        </h2>
        {accounts.length === 0 ? (
          <EmptyState
            icon={<WalletIcon width={24} height={24} />}
            title="هنوز حسابی ثبت نشده است"
            description="اولین حساب خود را با فرم بالا اضافه کنید."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => (
              <li key={account.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {account.name}
                        </span>
                        <Badge variant={accountTypeBadge(account.type)}>
                          {accountTypeLabel(account.type)}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        موجودی اولیه: {formatTomanWithUnit(account.openingBalance)}
                      </span>
                    </div>
                    <DeleteAccountButton
                      accountId={account.id}
                      accountName={account.name}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
