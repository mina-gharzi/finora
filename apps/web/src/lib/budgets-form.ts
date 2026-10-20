/**
 * Form state types for budget creation, editing and removal.
 *
 * A budget is uniquely identified by its expense category and month, so the
 * create and edit forms share the same good/bad shape: a success or error
 * status, an optional general message, and per-field validation errors keyed by
 * field name (`categoryId`, `monthStart`, `limitAmount`).
 */
export interface BudgetFormState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
  /** Per-field validation errors keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_BUDGET_FORM_STATE: BudgetFormState = { status: "idle" };

/** Editing an existing budget is a distinct intent but shares the shape. */
export type BudgetEditState = BudgetFormState;

export const EMPTY_BUDGET_EDIT_STATE: BudgetEditState = { status: "idle" };

export interface DeleteBudgetState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_DELETE_BUDGET_STATE: DeleteBudgetState = { status: "idle" };
