"use client";

import { useActionState } from "react";
import { requestEmailChangeAction } from "@/app/actions/email-change";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { EMPTY_RECOVERY_STATE } from "@/lib/auth-form";

export function ChangeEmailForm() {
  const [state, formAction, isPending] = useActionState(
    requestEmailChangeAction,
    EMPTY_RECOVERY_STATE,
  );

  if (state.success) {
    return <Alert variant="success">{state.message}</Alert>;
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <TextField
        label="ایمیل جدید"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <Button type="submit" loading={isPending} className="self-start">
        ارسال پیوند تأیید
      </Button>
    </form>
  );
}
