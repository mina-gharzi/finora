"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  ALREADY_VERIFIED_MESSAGE,
  EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
  EMAIL_VERIFIED_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  PASSWORD_RESET_DONE_MESSAGE,
  RECOVERY_REQUEST_SENT_MESSAGE,
  VERIFICATION_EMAIL_SENT_MESSAGE,
} from "@/lib/account-recovery";
import type { RecoveryFormState } from "@/lib/auth-form";
import { getAuthLimiters, enforceLimits } from "@/lib/auth-rate-limit";
import {
  consumeEmailVerifyToken,
  consumePasswordResetTokenAndSetPassword,
  discardAuthToken,
  issueAuthToken,
} from "@/lib/auth-tokens";
import { getClientIp } from "@/lib/client-ip";
import {
  isEmailDeliveryAvailable,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/adapter";
import { isEmailVerified, requireUserId } from "@/lib/dal";
import { createLogger } from "@/lib/logger";
import { hashPassword } from "@/lib/password";
import { tooManyAttemptsMessage } from "@/lib/rate-limit";
import { deleteSession } from "@/lib/session";
import { findUserByEmail, findUserById } from "@/lib/users";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  toFieldErrors,
  verifyEmailSchema,
} from "@/lib/validation";

/**
 * Background email work (initial verification resend) has no request context
 * worth threading, so a module-level logger is used. Events use stable names
 * and never carry the recipient, the token or the raw error message.
 */
const log = createLogger();

/**
 * Account-recovery server actions.
 *
 * Enumeration policy: every public response that could depend on whether an
 * address exists uses a shared message from `account-recovery`, so existing
 * and unknown emails are answered identically. The one deliberate exception
 * is documented on `requestPasswordResetAction`.
 */

export async function requestPasswordResetAction(
  _prevState: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const { forgotIp, forgotEmail } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([
    { limiter: forgotIp, key: ip },
    { limiter: forgotEmail, key: parsed.data.email },
  ]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  // Pre-flight BEFORE any account lookup: an environment that cannot send
  // email answers every submission — existing address or not — with the
  // same "unavailable" message, so the check itself cannot enumerate.
  if (!isEmailDeliveryAvailable()) {
    return { message: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE };
  }

  const user = await findUserByEmail(parsed.data.email);

  if (!user) {
    // Uniform generic answer. No token is issued and no email is attempted,
    // so there is nothing to fail or leak.
    return { success: true, message: RECOVERY_REQUEST_SENT_MESSAGE };
  }

  const { rawToken } = await issueAuthToken(user.id, "password_reset");
  const outcome = await sendPasswordResetEmail({
    // The normalized address the user submitted is the one on the account
    // row (both are trimmed + lowercased by the same validation schema).
    to: parsed.data.email,
    name: user.name,
    rawToken,
  });

  if (outcome === "unavailable") {
    // Do not leave a live link in the database that nobody received.
    await discardAuthToken(user.id, "password_reset");
    // SECURITY NOTE (accepted residual risk): while a configured provider is
    // experiencing a transient outage, this "unavailable" answer is returned
    // only for addresses that exist (unknown addresses already returned the
    // generic success above). That is an existence signal limited to
    // provider-outage windows; the alternative — claiming success when the
    // mail was never sent — is the "misleading success UI" this stage
    // forbids. The message itself never names the reason per-account.
    return { message: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE };
  }

  return { success: true, message: RECOVERY_REQUEST_SENT_MESSAGE };
}

export async function resetPasswordAction(
  _prevState: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const { tokenIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([{ limiter: tokenIp, key: ip }]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // Single-use + atomic: the token CAS and the password update commit
  // together (see auth-tokens). Wrong purpose, expiry, reuse and unknown
  // tokens all collapse into one indistinguishable answer.
  const userId = await consumePasswordResetTokenAndSetPassword(
    parsed.data.token,
    passwordHash,
  );
  if (!userId) {
    return { message: INVALID_TOKEN_MESSAGE };
  }

  // Every previously issued session (including this browser's, if signed
  // in) is now invalid through the auth_valid_after watermark; clearing the
  // cookie here just saves this browser from a dead session on next request.
  await deleteSession();

  return { success: true, message: PASSWORD_RESET_DONE_MESSAGE };
}

export async function verifyEmailAction(
  _prevState: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const parsed = verifyEmailSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) {
    return { message: INVALID_TOKEN_MESSAGE };
  }

  const { tokenIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([{ limiter: tokenIp, key: ip }]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  const userId = await consumeEmailVerifyToken(parsed.data.token);
  if (!userId) {
    return { message: INVALID_TOKEN_MESSAGE };
  }

  return { success: true, message: EMAIL_VERIFIED_MESSAGE };
}

/**
 * Requires a session (redirects to login otherwise). Answering for anonymous
 * callers would turn this endpoint into an address prober. Deliberately takes
 * no input: the target account, address and token all derive from the session,
 * so a posted form cannot redirect the resend anywhere else. Still valid as a
 * `useActionState` callback (extra arguments are ignored at runtime).
 */
export async function resendVerificationAction(): Promise<RecoveryFormState> {
  const userId = await requireUserId();

  const { resendUser, resendIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([
    { limiter: resendUser, key: userId },
    { limiter: resendIp, key: ip },
  ]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  if (await isEmailVerified(userId)) {
    return { success: true, message: ALREADY_VERIFIED_MESSAGE };
  }

  if (!isEmailDeliveryAvailable()) {
    return { message: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE };
  }

  const user = await findUserById(userId);
  if (!user) {
    redirect("/login");
  }

  const { rawToken } = await issueAuthToken(userId, "email_verify");
  const outcome = await sendVerificationEmail({
    to: user.email,
    name: user.name,
    rawToken,
  });

  if (outcome === "unavailable") {
    await discardAuthToken(userId, "email_verify");
    return { message: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE };
  }

  return { success: true, message: VERIFICATION_EMAIL_SENT_MESSAGE };
}

/**
 * Sends the first verification email for a freshly created account.
 * Called from the register action; failures are logged server-side only and
 * NEVER fail registration — the in-app banner's resend button is the retry
 * path and surfaces delivery problems to the user.
 */
export async function sendInitialVerificationEmail(input: {
  userId: string;
  email: string;
  name: string;
}): Promise<void> {
  if (!isEmailDeliveryAvailable()) {
    return;
  }
  try {
    const { rawToken } = await issueAuthToken(input.userId, "email_verify");
    const outcome = await sendVerificationEmail({
      to: input.email,
      name: input.name,
      rawToken,
    });
    if (outcome === "unavailable") {
      await discardAuthToken(input.userId, "email_verify");
      log.warn("auth.verification.initial_email_undelivered", {
        hint: "in-app resend is the retry path",
      });
    }
  } catch (error) {
    log.error("auth.verification.initial_email_failed", { error });
  }
}
