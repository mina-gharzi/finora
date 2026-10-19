"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/app/actions/account-recovery";
import { EMPTY_RECOVERY_STATE } from "@/lib/auth-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
    EMPTY_RECOVERY_STATE,
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && (
        <Alert variant={state.success ? "success" : "danger"}>
          {state.message}
        </Alert>
      )}

      <TextField
        label="ایمیل"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <Button type="submit" loading={isPending} className="w-full">
        ارسال پیوند بازیابی
      </Button>
    </form>
  );
}
