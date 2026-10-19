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

/**
 * State for the recovery/verification flows. `success` marks a definitively
 * completed step (e.g. the token was consumed and the password changed) so
 * the form can render a success panel instead of an error alert.
 */
export interface RecoveryFormState extends AuthFormState {
  success?: boolean;
}

export const EMPTY_RECOVERY_STATE: RecoveryFormState = {};
