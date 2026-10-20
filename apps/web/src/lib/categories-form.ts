/**
 * Form state types for category creation, renaming and deletion.
 */
export interface CategoryFormState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
  /** Per-field validation errors keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_CATEGORY_FORM_STATE: CategoryFormState = { status: "idle" };

/** Renaming shares the create form's shape but is a distinct intent. */
export type CategoryRenameState = CategoryFormState;

export const EMPTY_CATEGORY_RENAME_STATE: CategoryRenameState = {
  status: "idle",
};

export interface DeleteCategoryState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_DELETE_CATEGORY_STATE: DeleteCategoryState = {
  status: "idle",
};

export interface ArchiveCategoryState {
  /** Form submission status. */
  status: "idle" | "success" | "error";
  /** General message shown to the user. */
  message?: string;
}

export const EMPTY_ARCHIVE_CATEGORY_STATE: ArchiveCategoryState = {
  status: "idle",
};
