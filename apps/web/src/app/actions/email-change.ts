"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  EMAIL_ADDRESS_TAKEN_MESSAGE,
  EMAIL_CHANGE_ALREADY_USED_MESSAGE,
  EMAIL_CHANGE_SENT_MESSAGE,
  EMAIL_CHANGED_MESSAGE,
  EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
  INVALID_TOKEN_MESSAGE,
} from "@/lib/account-recovery";
import type { RecoveryFormState } from "@/lib/auth-form";
import { getAuthLimiters, enforceLimits } from "@/lib/auth-rate-limit";
import {
  consumeEmailChangeTokenAndSetEmail,
  discardAuthToken,
  issueAuthToken,
  readEmailChangeToken,
} from "@/lib/auth-tokens";
import { requireUserId } from "@/lib/dal";
import { getClientIp } from "@/lib/client-ip";
import {
  isEmailDeliveryAvailable,
  sendEmailChangeEmail,
} from "@/lib/email/adapter";
import { tooManyAttemptsMessage } from "@/lib/rate-limit";
import { deleteSession } from "@/lib/session";
import { findUserByEmail, findUserById } from "@/lib/users";
import {
  authTokenFieldSchema,
  changeEmailSchema,
  toFieldErrors,
} from "@/lib/validation";

/**
 * Email-change server actions.
 *
 * Enumeration policy: unlike the public recovery endpoints, BOTH actions here
 * are anchored to unguessable credentials — the request side to the caller's
 * own session, the completion side to the emailed token — so neither can be
 * used to probe arbitrary addresses. The request side therefore answers
 * honestly (duplicate address, same as current), which the settings UX
 * requires; the unauthenticated forgot-password flow is untouched and keeps
 * its byte-identical generic answers.
 *
 * Nothing on the request path writes `users.email`: the address changes only
 * inside the completion transaction, after the token CAS succeeded.
 */

export async function requestEmailChangeAction(
  _prevState: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  // Identity comes exclusively from the session; a posted form cannot name
  // another account to act on.
  const userId = await requireUserId();

  const parsed = changeEmailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const { changeEmailUser, changeEmailIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([
    { limiter: changeEmailUser, key: userId },
    { limiter: changeEmailIp, key: ip },
  ]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  const newEmail = parsed.data.email;

  const user = await findUserById(userId);
  if (!user) {
    // The account disappeared while the cookie was still alive.
    await deleteSession();
    redirect("/login");
  }

  if (newEmail === user.email) {
    return { fieldErrors: { email: "این ایمیل، ایمیل فعلی شماست." } };
  }
  if (await findUserByEmail(newEmail)) {
    return { fieldErrors: { email: "این ایمیل قبلاً ثبت شده است." } };
  }

  // Pre-flight before issuing: an environment that cannot send email must
  // not leave a live link nobody received.
  if (!isEmailDeliveryAvailable()) {
    return { message: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE };
  }

  const { rawToken } = await issueAuthToken(userId, "email_change", newEmail);
  const outcome = await sendEmailChangeEmail({
    // Delivered to the NEW address: opening it is what proves control of
    // the destination before the account adopts it.
    to: newEmail,
    name: user.name,
    rawToken,
  });

  if (outcome === "unavailable") {
    // Never claim delivery, and never keep an undeliverable link live.
    await discardAuthToken(userId, "email_change");
    return { message: EMAIL_DELIVERY_UNAVAILABLE_MESSAGE };
  }

  return { success: true, message: EMAIL_CHANGE_SENT_MESSAGE };
}

export async function confirmEmailChangeAction(
  _prevState: RecoveryFormState,
  formData: FormData,
): Promise<RecoveryFormState> {
  const token = authTokenFieldSchema.safeParse(formData.get("token"));
  if (!token.success) {
    return { message: INVALID_TOKEN_MESSAGE };
  }

  const { tokenIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([{ limiter: tokenIp, key: ip }]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  // Single-use + atomic: the token CAS, the address write, the verification
  // mark and the session-invalidation watermark commit together or not at
  // all (see consumeEmailChangeTokenAndSetEmail).
  const result = await consumeEmailChangeTokenAndSetEmail(token.data);

  if (result.status === "changed") {
    // Every previously issued session — other tabs, other devices, and this
    // browser's own cookie — stops authenticating through auth_valid_after;
    // clearing the cookie here just saves this browser from a dead session.
    await deleteSession();
    return { success: true, message: EMAIL_CHANGED_MESSAGE };
  }

  if (result.status === "taken") {
    // The address was claimed between issuance and completion. The
    // transaction rolled back, so neither account changed.
    return { message: EMAIL_ADDRESS_TAKEN_MESSAGE };
  }

  // Invalid: distinguish "already spent" (our purpose, consumed) from every
  // other failure, which stays one generic answer.
  const view = await readEmailChangeToken(token.data);
  if (view.state === "consumed") {
    return { message: EMAIL_CHANGE_ALREADY_USED_MESSAGE };
  }
  return { message: INVALID_TOKEN_MESSAGE };
}
