"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmEmailChangeAction } from "@/app/actions/email-change";
import { EMAIL_CHANGE_ALREADY_USED_MESSAGE } from "@/lib/account-recovery";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EMPTY_RECOVERY_STATE } from "@/lib/auth-form";

/**
 * Mounted for both `live` and `consumed` tokens so a server-action update
 * reconciles into the same instance: the local success state survives the
 * post-submit re-render that re-reads the token as consumed.
 */
export function ChangeEmailForm({
  token,
  tokenState,
  targetEmail,
}: {
  token: string;
  tokenState: "live" | "consumed";
  targetEmail?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    confirmEmailChangeAction,
    EMPTY_RECOVERY_STATE,
  );

  // The action's own outcome wins over the re-read token state.
  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">{state.message}</Alert>
        <Link href="/login" className="text-primary text-sm hover:underline">
          ورود با ایمیل جدید
        </Link>
      </div>
    );
  }

  // Initial render for a link that was already spent: no confirm button.
  if (tokenState === "consumed") {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">{EMAIL_CHANGE_ALREADY_USED_MESSAGE}</Alert>
        <Link href="/login" className="text-primary text-sm hover:underline">
          بازگشت به ورود
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <p className="text-sm text-muted-foreground">
        پس از تأیید، ایمیل حساب فینورا شما به{" "}
        <span className="font-medium text-foreground">{targetEmail}</span> تغییر
        می‌کند. نشانی جدید بلافاصله برای ورود استفاده می‌شود و همه نشست‌های
        قبلی پایان می‌یابد.
      </p>

      <input type="hidden" name="token" value={token} />

      <Button type="submit" loading={isPending} className="self-start">
        تأیید تغییر ایمیل
      </Button>
    </form>
  );
}
