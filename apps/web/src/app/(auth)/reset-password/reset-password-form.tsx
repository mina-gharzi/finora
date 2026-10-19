"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/account-recovery";
import { EMPTY_RECOVERY_STATE } from "@/lib/auth-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    resetPasswordAction,
    EMPTY_RECOVERY_STATE,
  );

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">{state.message}</Alert>
        <Link
          href="/login"
          className="text-primary text-sm hover:underline"
        >
          رفتن به صفحه ورود
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <input type="hidden" name="token" value={token} />

      <TextField
        label="گذرواژه جدید"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        description="حداقل ۸ نویسه، شامل یک حرف و یک رقم."
        error={state.fieldErrors?.password}
      />

      <TextField
        label="تکرار گذرواژه جدید"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />

      <Button type="submit" loading={isPending} className="w-full">
        تغییر گذرواژه
      </Button>
    </form>
  );
}
