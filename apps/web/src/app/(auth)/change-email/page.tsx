import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { INVALID_TOKEN_MESSAGE } from "@/lib/account-recovery";
import { readEmailChangeToken } from "@/lib/auth-tokens";
import { Alert } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChangeEmailForm } from "./change-email-form";

export const metadata: Metadata = { title: "تغییر ایمیل" };

type ChangeEmailPageProps = {
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
 * is per-request; the card shell still prerenders. The GET render is
 * strictly read-only: mail scanners and link prefetchers must never be able
 * to spend the link — consumption happens only on the explicit confirm
 * submit, like the other token pages.
 *
 * `live` and `consumed` both mount the same client component so that the
 * post-action re-render reconciles instead of unmounting it (the action's
 * own success/error state would otherwise be thrown away when the token is
 * re-read as consumed).
 */
async function ChangeEmailTokenGate({ searchParams }: ChangeEmailPageProps) {
  const token = readToken((await searchParams).token);

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="danger">{INVALID_TOKEN_MESSAGE}</Alert>
        <LoginLink />
      </div>
    );
  }

  const view = await readEmailChangeToken(token);

  if (view.state === "live" || view.state === "consumed") {
    return (
      <ChangeEmailForm
        token={token}
        tokenState={view.state}
        targetEmail={view.state === "live" ? view.targetEmail : undefined}
      />
    );
  }

  // Absent, expired, malformed, or a token minted for a different flow —
  // one indistinguishable answer.
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="danger">{INVALID_TOKEN_MESSAGE}</Alert>
      <LoginLink />
    </div>
  );
}

function LoginLink() {
  return (
    <Link href="/login" className="text-primary text-sm hover:underline">
      بازگشت به ورود
    </Link>
  );
}

export default function ChangeEmailPage({
  searchParams,
}: ChangeEmailPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">تغییر ایمیل</CardTitle>
        <CardDescription>
          با تأیید این پیوند، ایمیل حساب فینورا شما به نشانی دریافت‌کننده این
          ایمیل تغییر می‌کند.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="animate-pulse h-32 rounded-md bg-surface-muted"
            />
          }
        >
          <ChangeEmailTokenGate searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
