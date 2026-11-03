/**
 * Form state for transfer creation.
 */
export interface TransferFormState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
  /** Per-field validation errors keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_TRANSFER_FORM_STATE: TransferFormState = {
  status: "idle",
};

/** Form state for transfer deletion. */
export interface DeleteTransferState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_DELETE_TRANSFER_STATE: DeleteTransferState = {
  status: "idle",
};
