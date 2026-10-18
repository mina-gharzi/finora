/**
 * Form state types for account creation and deletion.
 */
export interface AccountFormState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
  /** Per-field validation errors keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_ACCOUNT_FORM_STATE: AccountFormState = { status: "idle" };

export interface DeleteAccountState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_DELETE_ACCOUNT_STATE: DeleteAccountState = { status: "idle" };

export interface ArchiveAccountState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_ARCHIVE_ACCOUNT_STATE: ArchiveAccountState = {
  status: "idle",
};
