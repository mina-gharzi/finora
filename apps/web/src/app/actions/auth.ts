"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendInitialVerificationEmail } from "@/app/actions/account-recovery";
import type { AuthFormState } from "@/lib/auth-form";
import {
  getAuthLimiters,
  enforceLimits,
} from "@/lib/auth-rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { requireUserId } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  INVALID_CREDENTIALS_MESSAGE,
  rateLimitedMessage,
  verifyPasswordLogin,
} from "@/lib/password-login";
import { tooManyAttemptsMessage } from "@/lib/rate-limit";
import { createSession, deleteSession } from "@/lib/session";
import {
  createUser,
  findUserByEmail,
  findUserCredentialsById,
  updateUserPasswordIfCurrent,
} from "@/lib/users";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  toFieldErrors,
} from "@/lib/validation";

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  // Limit before any hashing or database work so abuse stays cheap to reject.
  const { registerIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const gate = await enforceLimits([{ limiter: registerIp, key: ip }]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  const { name, email, password } = parsed.data;

  // Enumeration note (accepted, bounded): registration answers honestly that an
  // address is already taken. Unlike the unauthenticated recovery flow — where
  // the correct answer is a byte-identical generic "check your inbox" — a
  // register response has no neutral equivalent: claiming success for an
  // existing address would either create no account while telling the user it
  // did, or require an email-confirmation-based signup redesign (a product
  // change, out of scope). The oracle is therefore kept and bounded by the
  // per-IP register limit above. Do not "fix" this by returning generic success.
  if (await findUserByEmail(email)) {
    return { fieldErrors: { email: "این ایمیل قبلاً ثبت شده است." } };
  }

  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    ({ id: userId } = await createUser({ name, email, passwordHash }));
  } catch (error) {
    // Unique-violation race: the address was taken between the check and insert.
    if (isUniqueViolation(error)) {
      return { fieldErrors: { email: "این ایمیل قبلاً ثبت شده است." } };
    }
    // Anything else (connection loss, etc.) is a real failure, not a duplicate.
    throw error;
  }

  // Best-effort first verification email. Failures never fail registration:
  // the account exists and the in-app banner's resend action is the retry
  // path (and the surface that reports delivery problems to the user).
  await sendInitialVerificationEmail({ userId, email, name });

  await createSession(userId);
  redirect("/dashboard");
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  const { email, password } = parsed.data;

  const result = await verifyPasswordLogin(
    email,
    password,
    await headers(),
  );

  if (!result.ok) {
    return {
      message:
        result.reason === "rate_limited"
          ? rateLimitedMessage(result.retryAfterSeconds)
          : INVALID_CREDENTIALS_MESSAGE,
    };
  }

  await createSession(result.userId);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

/**
 * In-session password change. The identity comes from the session (never
 * from the form), the CURRENT password is re-proven server-side against the
 * stored hash, and the update is a compare-and-swap so a concurrent change
 * cannot be silently overwritten.
 *
 * On success the update also raises the session-invalidation watermark, so
 * every previously issued token — other tabs, other devices, and this
 * browser's own cookie — stops authenticating at the DAL gate. This session
 * is cleared explicitly and the user is sent to sign in again with the new
 * password, matching the password-reset flow's "all sessions end" semantics.
 */
export async function changePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const userId = await requireUserId();

  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error) };
  }

  // Limit before the current-password check and the new-password hash: both
  // verify and hash are bcrypt work an authenticated attacker could otherwise
  // drive without bound.
  const { changePasswordUser } = getAuthLimiters();
  const gate = await enforceLimits([{ limiter: changePasswordUser, key: userId }]);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }

  const user = await findUserCredentialsById(userId);
  if (!user) {
    // The account disappeared while the cookie was still alive.
    await deleteSession();
    redirect("/login");
  }

  const isCurrentValid = await verifyPassword(
    parsed.data.current,
    user.passwordHash,
  );
  if (!isCurrentValid) {
    return { fieldErrors: { current: "گذرواژه فعلی نادرست است." } };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const updated = await updateUserPasswordIfCurrent(
    userId,
    user.passwordHash,
    passwordHash,
  );
  if (!updated) {
    // The stored hash changed between the verification and the write: the
    // form's "current" password is stale, so the change must not apply.
    return {
      message: "گذرواژه فعلی دیگر معتبر نیست. لطفاً دوباره تلاش کنید.",
    };
  }

  await deleteSession();
  redirect("/login?passwordChanged=1");
}