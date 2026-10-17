"use client";

import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";
import { EMPTY_AUTH_STATE } from "@/lib/auth-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(
    registerAction,
    EMPTY_AUTH_STATE,
  );

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {state.message && <Alert variant="danger">{state.message}</Alert>}

      <TextField
        label="نام"
        name="name"
        type="text"
        autoComplete="name"
        required
        error={state.fieldErrors?.name}
      />

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
        autoComplete="new-password"
        required
        description="حداقل ۸ نویسه، شامل یک حرف و یک رقم."
        error={state.fieldErrors?.password}
      />

      <Button type="submit" loading={isPending} className="w-full">
        ثبت‌نام
      </Button>
    </form>
  );
}
