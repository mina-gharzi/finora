import { InboxIcon } from "@/components/icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Presentational dashboard content. Kept free of session/data concerns so it
 * can be unit tested in isolation and streamed inside the protected page.
 */
export function DashboardView() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">داشبورد</h1>
        <p className="text-sm text-muted-foreground">
          نمای کلی وضعیت مالی شما در یک نگاه.
        </p>
      </header>

      <Alert variant="info" title="در حال ساخت">
        این نسخه پایه‌ی رابط کاربری است. بخش‌های مالی (تراکنش‌ها، حساب‌ها و
        گزارش‌ها) در مراحل بعدی تکمیل خواهند شد.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>تراکنش‌های اخیر</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<InboxIcon width={24} height={24} />}
            title="هنوز تراکنشی ثبت نشده است"
            description="پس از افزودن اولین تراکنش، خلاصه‌ی درآمد و هزینه‌ها در این بخش نمایش داده می‌شود."
            action={
              <Button variant="secondary" disabled>
                افزودن تراکنش
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
