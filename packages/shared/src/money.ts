/**
 * Integer Toman formatting.
 *
 * Guarantees:
 * - Amounts are always integers (or bigints). Floating-point arithmetic is
 *   never performed, so no precision is lost.
 * - Output always uses Latin digits with `,` as the thousands separator,
 *   independent of the runtime locale.
 * - This module only *formats* values for display. Arithmetic, conversion and
 *   persistence are deliberately kept elsewhere.
 *
 * @module @finora/shared/money
 */

export const TOMAN_UNIT = "تومان";

export type TomanAmount = number | bigint;

function digitsOf(amount: TomanAmount): string {
  if (typeof amount === "bigint") {
    return amount.toString();
  }

  if (typeof amount !== "number") {
    throw new TypeError(
      `formatToman expects a number or bigint, received ${typeof amount}.`,
    );
  }

  if (!Number.isFinite(amount)) {
    throw new RangeError("formatToman expects a finite number.");
  }

  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(
      "formatToman expects an integer inside the safe number range; pass a bigint for larger values.",
    );
  }

  return amount.toString();
}

function groupInteger(digits: string): string {
  const negative = digits.startsWith("-");
  const body = negative ? digits.slice(1) : digits;

  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    if (i > 0 && (body.length - i) % 3 === 0) {
      out += ",";
    }
    out += body.charAt(i);
  }

  return negative ? `-${out}` : out;
}

/**
 * Formats an integer Toman amount with thousands separators, e.g. `1234567`
 * becomes `"1,234,567"`.
 *
 * @throws {TypeError} when the value is neither a number nor a bigint.
 * @throws {RangeError} when the value is not a finite safe integer.
 */
export function formatToman(amount: TomanAmount): string {
  return groupInteger(digitsOf(amount));
}

/**
 * Formats an integer Toman amount and appends a unit label, e.g. `1234`
 * becomes `"1,234 تومان"`.
 */
export function formatTomanWithUnit(
  amount: TomanAmount,
  unit: string = TOMAN_UNIT,
): string {
  return `${formatToman(amount)} ${unit}`;
}
