import { formatTomanWithUnit } from "@finora/shared";

const MINUS = "\u2212";

export function formatSignedToman(amount: number): string {
  if (amount < 0) {
    return `${MINUS}${formatTomanWithUnit(-amount)}`;
  }

  if (amount > 0) {
    return `+${formatTomanWithUnit(amount)}`;
  }

  return formatTomanWithUnit(0);
}
