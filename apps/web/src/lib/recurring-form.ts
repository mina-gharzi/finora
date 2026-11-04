/**
 * Form state for creating recurring rules and for the row-level toggle/delete
 * controls. Mirrors the transaction form state contracts.
 */
export interface RecurringFormState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
  /** Per-field validation errors keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_RECURRING_FORM_STATE: RecurringFormState = {
  status: "idle",
};

/** Form state for pausing/resuming a rule. */
export interface ToggleRecurringState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const EMPTY_TOGGLE_RECURRING_STATE: ToggleRecurringState = {
  status: "idle",
};

/** Form state for deleting a rule. */
export interface DeleteRecurringState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const EMPTY_DELETE_RECURRING_STATE: DeleteRecurringState = {
  status: "idle",
};
