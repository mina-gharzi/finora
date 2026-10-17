/**
 * Helpers for recognising PostgreSQL errors. Drivers and ORMs may wrap the
 * original error (e.g. in a `cause`), so the chain is inspected.
 */

const UNIQUE_VIOLATION = "23505";
const MAX_DEPTH = 5;

function hasCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code: unknown }).code === code
  );
}

/** True when `error` (or anything in its cause chain) is a unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (hasCode(current, UNIQUE_VIOLATION)) {
      return true;
    }
    if (typeof current !== "object" || current === null || !("cause" in current)) {
      return false;
    }
    current = (current as { cause: unknown }).cause;
  }
  return false;
}