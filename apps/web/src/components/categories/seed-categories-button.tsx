"use client";

import { useActionState } from "react";
import { seedDefaultCategoriesAction } from "@/app/actions/categories";
import { EMPTY_CATEGORY_FORM_STATE } from "@/lib/categories-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Offers the starter categories to a user who has none yet. Idempotent on the
 * server, so a repeated click only reports that nothing was left to add.
 */
export function SeedCategoriesButton() {
  const [state, formAction, isPending] = useActionState(
    seedDefaultCategoriesAction,
    EMPTY_CATEGORY_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-center gap-3">
      {state.status === "success" && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}

      <Button type="submit" variant="secondary" loading={isPending}>
        افزودن دسته‌بندی‌های پیشنهادی
      </Button>
    </form>
  );
}
