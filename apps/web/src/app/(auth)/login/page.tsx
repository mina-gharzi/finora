import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };

/** Shown after a deliberate sign-out caused by an in-session password change. */
const PASSWORD_CHANGED_MESSAGE =
  "گذرواژه شما با موفقیت تغییر کرد. برای ادامه با گذرواژه جدید وارد شوید.";

/** Shown when a signed-but-revoked cookie finally reaches the login page. */
const SESSION_EXPIRED_MESSAGE =
  "نشست شما به پایان رسیده است. لطفاً دوباره وارد شوید.";

type LoginPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function readFlag(
  value: string | string[] | undefined,
  expected: string,
): boolean {
  if (Array.isArray(value)) {
    value = value[0];
  }
  return value === expected;
}

/**
 * The notices this login visit should carry. It streams in under Suspense so
 * the card shell still prerenders (the same pattern as the token pages).
 */
async function LoginNotices({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  if (readFlag(params.passwordChanged, "1")) {
    return <Alert variant="success">{PASSWORD_CHANGED_MESSAGE}</Alert>;
  }

  if (readFlag(params.session, "expired")) {
    return <Alert variant="warning">{SESSION_EXPIRED_MESSAGE}</Alert>;
  }

  return null;
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">ورود به فینورا</CardTitle>
        <CardDescription>برای ادامه وارد حساب خود شوید.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Suspense
          fallback={
            <div
              aria-busy="true"
              className="animate-pulse h-8 rounded-md bg-surface-muted"
            />
          }
        >
          <LoginNotices searchParams={searchParams} />
        </Suspense>
        <LoginForm />
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <Link
            href="/forgot-password"
            className="text-primary hover:underline"
          >
            گذرواژه خود را فراموش کرده‌اید؟
          </Link>
          <p>
            حساب ندارید؟{" "}
            <Link href="/register" className="text-primary hover:underline">
              ثبت‌نام کنید
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
