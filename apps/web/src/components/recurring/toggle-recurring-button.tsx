"use client";

import { useActionState } from "react";
import { toggleRecurringActiveAction } from "@/app/actions/recurring";
import { EMPTY_TOGGLE_RECURRING_STATE } from "@/lib/recurring-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface ToggleRecurringButtonProps {
  recurringId: string;
  active: boolean;
}

/**
 * Enables or pauses one rule. The id and desired state travel as hidden fields;
 * ownership is re-verified server-side. Resuming never backfills the paused
 * period, so this is a single click with no confirmation step.
 */
export function ToggleRecurringButton({
  recurringId,
  active,
}: ToggleRecurringButtonProps) {
  const [state, formAction, isPending] = useActionState(
    toggleRecurringActiveAction,
    EMPTY_TOGGLE_RECURRING_STATE,
  );

  return (
    <div className="flex flex-col items-start gap-2">
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}
      <form action={formAction}>
        <input type="hidden" name="id" value={recurringId} />
        <input type="hidden" name="active" value={String(!active)} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={isPending}
          aria-label={active ? "توقف قانون تکرارشونده" : "فعال‌سازی قانون تکرارشونده"}
        >
          {active ? "توقف" : "فعال‌سازی"}
        </Button>
      </form>
    </div>
  );
}
