import type { Toman } from "./types";

/** Largest amount accepted anywhere in the domain. */
export const MAX_TOMAN: Toman = Number.MAX_SAFE_INTEGER;

const PERSIAN_ZERO = 0x06f0;
const ARABIC_ZERO = 0x0660;

/** Converts Persian/Arabic-Indic digits to Latin and strips common separators. */
export function normalizeAmountText(input: string): string {
  return input
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - ARABIC_ZERO))
    .replace(/[,\u066C\u060C\s]/g, "");
}

export function isValidToman(value: unknown): value is Toman {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_TOMAN
  );
}

/**
 * Parses user-typed text into integer Toman. Returns null for anything that is
 * not a plain non-negative whole number (decimals, signs, exponents, text).
 */
export function parseTomanAmount(input: string): Toman | null {
  const text = normalizeAmountText(input);
  if (!/^\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return isValidToman(value) ? value : null;
}

/**
 * Converts a database aggregate (Postgres `sum`/`bigint`, which node-postgres
 * surfaces as a string) into integer Toman.
 *
 * A missing value (an aggregate over zero rows) is `0`. Anything that is not a
 * safe, non-negative integer throws rather than being silently coerced, so a
 * total can never lose precision unnoticed.
 */
export function toTomanFromAggregate(
  value: string | number | null | undefined,
): Toman {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!isValidToman(parsed)) {
    throw new RangeError(
      "Aggregate amount is outside the supported Toman range.",
    );
  }
  return parsed;
}

/** Exact addition; throws instead of silently losing precision. */
export function addToman(a: Toman, b: Toman): Toman {
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) {
    throw new RangeError("Toman sum exceeds the safe integer range.");
  }
  return sum;
}

/** Sum of a list; empty list is 0. */
export function sumToman(values: readonly Toman[]): Toman {
  return values.reduce<Toman>((total, v) => addToman(total, v), 0);
}