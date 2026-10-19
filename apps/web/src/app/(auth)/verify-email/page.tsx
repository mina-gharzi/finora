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
import { VerifyEmailForm } from "./verify-email-form";

export const metadata: Metadata = { title: "تأیید ایمیل" };

type VerifyPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

function readToken(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    value = value[0];
  }
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Landing page for the emailed verification link. The token-bearing section
 * streams in under Suspense so the card shell still prerenders.
 *
 * The token is deliberately NOT consumed on this GET render: mail scanners
 * and link prefetchers issue GET requests, and a token spent by a crawler
 * would deny the real user. Consumption happens only when the visitor
 * submits the explicit confirmation button (a server action).
 */
async function VerifyTokenGate({ searchParams }: VerifyPageProps) {
  const token = readToken((await searchParams).token);

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="danger">{INVALID_TOKEN_MESSAGE}</Alert>
        <Link href="/login" className="text-primary text-sm hover:underline">
          بازگشت به ورود
        </Link>
      </div>
    );
  }

  return <VerifyEmailForm token={token} />;
}

export default function VerifyEmailPage({ searchParams }: VerifyPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">تأیید ایمیل</CardTitle>
        <CardDescription>
          برای فعال‌سازی کامل حساب، ایمیل خود را تأیید کنید.
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
          <VerifyTokenGate searchParams={searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
