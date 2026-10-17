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
    };
  }
  return globalForLimiters.finoraAuthLimiters;
}