"use client";

import { useActionState } from "react";
import { verifyEmailAction } from "@/app/actions/account-recovery";
import { EMPTY_RECOVERY_STATE } from "@/lib/auth-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    verifyEmailAction,
    EMPTY_RECOVERY_STATE,
  );

  if (state.success) {
    return <Alert variant="success">{state.message}</Alert>;
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <input type="hidden" name="token" value={token} />

      <Button type="submit" loading={isPending} className="w-full">
        تأیید ایمیل
      </Button>
    </form>
  );
}
