import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/dal";
import { ResendVerificationButton } from "./resend-verification-button";

/**
 * Persistent notice for accounts that have not completed email verification.
 * Reads the request-scoped user (cached once per render pass) and renders
 * nothing when the account is verified or signed out. Financial *reads*
 * stay available to unverified accounts; the resend action is how they
 * unblock mutations.
 */
export async function VerifyEmailBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerifiedAt) {
    return null;
  }

  return (
    <Alert variant="warning" className="mb-4" title="ایمیل شما تأیید نشده است">
      <p>
        برای انجام عملیات مالی (ثبت، ویرایش و حذف تراکنش، حساب و دسته‌بندی)
        ابتدا ایمیل خود را تأیید کنید. لینک تأیید پس از ثبت‌نام به ایمیل شما
        ارسال شده است.
      </p>
      <div className="mt-2">
        <ResendVerificationButton />
      </div>
    </Alert>
  );
}
