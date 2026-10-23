import { formatJalaliDate } from "@finora/shared";

export function formatJalaliFromIso(isoDate: string): string {
  return formatJalaliDate(new Date(`${isoDate}T00:00:00Z`));
}
