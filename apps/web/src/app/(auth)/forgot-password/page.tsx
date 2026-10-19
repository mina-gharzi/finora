import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "فراموشی گذرواژه" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">فراموشی گذرواژه</CardTitle>
        <CardDescription>
          ایمیل حساب خود را وارد کنید تا پیوند تعیین گذرواژه جدید برایتان
          ارسال شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ForgotPasswordForm />
        <p className="text-sm text-muted-foreground">
          گذرواژه خود را به یاد دارید؟{" "}
          <Link href="/login" className="text-primary hover:underline">
            بازگشت به ورود
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
