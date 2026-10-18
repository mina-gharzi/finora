/**
 * Form state for transaction creation and editing.
 */
export interface TransactionFormState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
  /** Per-field validation errors keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_TRANSACTION_FORM_STATE: TransactionFormState = {
  status: "idle",
};

/** Form state for transaction deletion. */
export interface DeleteTransactionState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_DELETE_TRANSACTION_STATE: DeleteTransactionState = {
  status: "idle",
};
