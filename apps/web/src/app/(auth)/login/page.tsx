import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ورود" };

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">ورود به فینورا</CardTitle>
        <CardDescription>برای ادامه وارد حساب خود شوید.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
