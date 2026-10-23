import "server-only";

import {
  checkLimits,
  getAuthLimiters,
  hitLimits,
  resetLimits,
} from "@/lib/auth-rate-limit";
import { getClientIp, type HeaderReader } from "@/lib/client-ip";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/password";
import { tooManyAttemptsMessage } from "@/lib/rate-limit";
import { findUserByEmail } from "@/lib/users";

export type PasswordLoginResult =
  | {
      ok: true;
      userId: string;
      name: string;
      email: string;
      emailVerifiedAt: Date | null;
    }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

/**
 * Password credential check shared by the web form action and the mobile JSON
 * route. The rate-limit keys, dummy-hash timing equalization, and counter
 * behavior must stay identical on both surfaces.
 */
export async function verifyPasswordLogin(
  email: string,
  password: string,
  requestHeaders: HeaderReader,
): Promise<PasswordLoginResult> {
  // Keyed on the submitted email (whether or not it exists) so the response
  // never reveals account existence. Checked before bcrypt to save CPU.
  const { loginAccount, loginIp } = getAuthLimiters();
  const ip = getClientIp(requestHeaders);
  const gate = await checkLimits([
    { limiter: loginAccount, key: email },
    { limiter: loginIp, key: ip },
  ]);
  if (!gate.allowed) {
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: gate.retryAfterSeconds,
    };
  }

  const user = await findUserByEmail(email);

  // Compare even for unknown emails so timing does not reveal account existence.
  const isPasswordValid = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !isPasswordValid) {
    // Only FAILED logins consume the budget, so a legitimate sign-in never
    // counts against the account; a store failure here still returns the
    // generic invalid-credentials answer (the attempt was not counted, but the
    // gate above already proved the store reachable, and the next attempt will
    // fail closed if it is not).
    await hitLimits([
      { limiter: loginAccount, key: email },
      { limiter: loginIp, key: ip },
    ]);
    return { ok: false, reason: "invalid_credentials" };
  }

  // Clear the account-scoped counter on success so a forgotten-password burst
  // before a correct login does not lock the account out. A store failure is
  // swallowed here (a store outage must not become a login outage) — the IP
  // counter remains as the backstop.
  await resetLimits([{ limiter: loginAccount, key: email }]);

  return {
    ok: true,
    userId: user.id,
    name: user.name,
    email,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

export const INVALID_CREDENTIALS_MESSAGE = "ایمیل یا گذرواژه نادرست است.";

export function rateLimitedMessage(retryAfterSeconds: number): string {
  return tooManyAttemptsMessage(retryAfterSeconds);
}
