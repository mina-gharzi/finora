import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangeEmailForm } from "./change-email-form";
import { ChangePasswordForm } from "./change-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getCurrentUser } from "@/lib/dal";

export const metadata: Metadata = {
  title: "تنظیمات",
};

async function AuthenticatedSettings() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">تنظیمات</h1>
        <p className="text-sm text-muted-foreground">
          امنیت حساب کاربری خود را مدیریت کنید.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>تغییر گذرواژه</CardTitle>
          <CardDescription>
            گذرواژه حساب {user.email} را تغییر دهید. پس از تغییر، همه نشست‌ها
            (از جمله این مرورگر) پایان می‌یابد و باید دوباره وارد شوید.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تغییر ایمیل</CardTitle>
          <CardDescription>
            ایمیل فعلی: {user.email}. نشانی جدید تنها پس از تأیید از طریق پیوند
            ارسال‌شده به همان نشانی جایگزین می‌شود؛ تا آن زمان ایمیل حساب
            تغییری نمی‌کند.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <AuthenticatedSettings />
    </Suspense>
  );
}
