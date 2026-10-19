"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendInitialVerificationEmail } from "@/app/actions/account-recovery";
import type { AuthFormState } from "@/lib/auth-form";
import { getAuthLimiters } from "@/lib/auth-rate-limit";
import { getClientIp } from "@/lib/client-ip";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/password";
import { tooManyAttemptsMessage } from "@/lib/rate-limit";
import { createSession, deleteSession } from "@/lib/session";
import { createUser, findUserByEmail } from "@/lib/users";
import { loginSchema, registerSchema, toFieldErrors } from "@/lib/validation";

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
  const gate = registerIp.check(ip);
  if (!gate.allowed) {
    return { message: tooManyAttemptsMessage(gate.retryAfterSeconds) };
  }
  registerIp.hit(ip);

  const { name, email, password } = parsed.data;

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
  redirect("/");
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

  // Keyed on the submitted email (whether or not it exists) so the response
  // never reveals account existence. Checked before bcrypt to save CPU.
  const { loginAccount, loginIp } = getAuthLimiters();
  const ip = getClientIp(await headers());
  const accountGate = loginAccount.check(email);
  const ipGate = loginIp.check(ip);
  if (!accountGate.allowed || !ipGate.allowed) {
    return {
      message: tooManyAttemptsMessage(
        Math.max(accountGate.retryAfterSeconds, ipGate.retryAfterSeconds),
      ),
    };
  }

  const user = await findUserByEmail(email);

  // Compare even for unknown emails so timing does not reveal account existence.
  const isPasswordValid = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !isPasswordValid) {
    loginAccount.hit(email);
    loginIp.hit(ip);
    return { message: "ایمیل یا گذرواژه نادرست است." };
  }

  loginAccount.reset(email);
  await createSession(user.id);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await deleteSession();
  redirect("/login");
}