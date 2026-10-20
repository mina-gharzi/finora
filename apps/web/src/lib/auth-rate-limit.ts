import "server-only";
import { createRateLimiter, type RateLimiter } from "./rate-limit";

/**
 * Rate-limit policy for the authentication actions. Limiters live on
 * `globalThis` so they survive module reloads in development. State is
 * process-local (see rate-limit.ts).
 */

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

interface AuthLimiters {
  /** Failed logins per submitted email. */
  loginAccount: RateLimiter;
  /** Failed logins per client address. */
  loginIp: RateLimiter;
  /** All registration attempts per client address. */
  registerIp: RateLimiter;
  /** Password-reset requests per client address. */
  forgotIp: RateLimiter;
  /** Password-reset requests per submitted email (existing or not). */
  forgotEmail: RateLimiter;
  /** Reset-password / verify-email submissions per client address. */
  tokenIp: RateLimiter;
  /** Verification resends per signed-in user. */
  resendUser: RateLimiter;
  /** Verification resends per client address. */
  resendIp: RateLimiter;
  /** Email-change requests per signed-in user. */
  changeEmailUser: RateLimiter;
  /** Email-change requests per client address. */
  changeEmailIp: RateLimiter;
}

const globalForLimiters = globalThis as unknown as {
  finoraAuthLimiters?: AuthLimiters;
};

export function getAuthLimiters(): AuthLimiters {
  if (!globalForLimiters.finoraAuthLimiters) {
    globalForLimiters.finoraAuthLimiters = {
      loginAccount: createRateLimiter({ limit: 5, windowMs: FIFTEEN_MINUTES }),
      loginIp: createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES }),
      registerIp: createRateLimiter({ limit: 20, windowMs: ONE_HOUR }),
      forgotIp: createRateLimiter({ limit: 10, windowMs: ONE_HOUR }),
      forgotEmail: createRateLimiter({ limit: 3, windowMs: ONE_HOUR }),
      tokenIp: createRateLimiter({ limit: 20, windowMs: FIFTEEN_MINUTES }),
      resendUser: createRateLimiter({ limit: 3, windowMs: ONE_HOUR }),
      resendIp: createRateLimiter({ limit: 10, windowMs: ONE_HOUR }),
      // Mirrors the resend policy: an authenticated user can still mail a
      // handful of addresses per hour, but cannot be scripted to bombard
      // arbitrary inboxes with change links.
      changeEmailUser: createRateLimiter({ limit: 3, windowMs: ONE_HOUR }),
      changeEmailIp: createRateLimiter({ limit: 10, windowMs: ONE_HOUR }),
    };
  }
  return globalForLimiters.finoraAuthLimiters;
}