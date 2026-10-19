import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { INVALID_TOKEN_MESSAGE } from "@/lib/account-recovery";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "تغییر گذرواژه" };

type ResetPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

/** A link may arrive with repeated/malformed query params; take the first string. */
function readToken(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    value = value[0];
  }
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The token lives in the query string, so only this Suspense-wrapped section
 * is per-request; the card shell (title, description) still prerenders. The
 * token is deliberately NOT consumed on this GET render: mail scanners and
 * link prefetchers issue GET requests, and a token spent by a crawler would
 * deny the real user. Consumption happens only on explicit form submit.
 */
async function ResetTokenGate({ searchParams }: ResetPageProps) {
  const token = readToken((await searchParams).token);

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="danger">{INVALID_TOKEN_MESSAGE}</Alert>
        <Link
          href="/forgot-password"
          className="text-primary text-sm hover:underline"
        >
          ثبت درخواست جدید بازیابی گذرواژه
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({ searchParams }: ResetPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">تغییر گذرواژه</CardTitle>
        <CardDescription>
          گذرواژه جدید خود را انتخاب کنید. پس از تغییر، همه نشست‌های قبلی خروج
          می‌کنند.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="animate-pulse h-48 rounded-md bg-surface-muted"
            />
          }
        >
          <ResetTokenGate searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
