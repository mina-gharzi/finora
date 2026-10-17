"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { EMPTY_AUTH_STATE } from "@/lib/auth-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    EMPTY_AUTH_STATE,
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <TextField
        label="ایمیل"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.fieldErrors?.email}
      />

      <TextField
        label="گذرواژه"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />

      <Button type="submit" loading={isPending} className="w-full">
        ورود
      </Button>
    </form>
  );
}
