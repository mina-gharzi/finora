import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "ثبت‌نام" };

export default function RegisterPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1">ساخت حساب فینورا</CardTitle>
        <CardDescription>
          برای شروع، یک حساب کاربری بسازید.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RegisterForm />
        <p className="text-sm text-muted-foreground">
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <Link href="/login" className="text-primary hover:underline">
            وارد شوید
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
