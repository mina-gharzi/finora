"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { EMPTY_AUTH_STATE } from "@/lib/auth-form";

export function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(
    changePasswordAction,
    EMPTY_AUTH_STATE,
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <TextField
        label="گذرواژه فعلی"
        name="current"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.current}
      />

      <TextField
        label="گذرواژه جدید"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        description="حداقل ۸ نویسه، شامل حداقل یک حرف و یک رقم."
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

      <Button type="submit" loading={isPending} className="self-start">
        تغییر گذرواژه
      </Button>
    </form>
  );
}
