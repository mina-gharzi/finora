/**
 * Shared shape for authentication form state. Lives outside the `"use server"`
 * action module because such modules may only export async functions.
 */
export interface AuthFormState {
  /** Form-level error message (e.g. invalid credentials). */
  message?: string;
  /** Per-field validation messages, keyed by field name. */
  fieldErrors?: Record<string, string>;
}

export const EMPTY_AUTH_STATE: AuthFormState = {};
