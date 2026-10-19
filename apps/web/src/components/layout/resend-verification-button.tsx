"use client";

import { useActionState } from "react";
import { resendVerificationAction } from "@/app/actions/account-recovery";
import { EMPTY_RECOVERY_STATE } from "@/lib/auth-form";
import { Button } from "@/components/ui/button";

/**
 * Resend control for the unverified-account banner. The action requires a
 * session and is rate limited per user and per address on the server.
 */
export function ResendVerificationButton() {
  const [state, formAction, isPending] = useActionState(
    resendVerificationAction,
    EMPTY_RECOVERY_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="submit" variant="secondary" size="sm" loading={isPending}>
        ارسال دوباره ایمیل تأیید
      </Button>
      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`text-sm ${state.success ? "text-success" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
