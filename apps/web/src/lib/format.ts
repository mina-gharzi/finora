import { formatJalaliDate } from "@finora/shared";

/**
 * Presentation helper for dates stored as Gregorian `YYYY-MM-DD` strings.
 *
 * The stored value is a calendar date, not an instant, so it is anchored to UTC
 * midnight and formatted in UTC. That keeps the displayed Jalali date identical
 * regardless of the server's own time zone.
 */
export function formatJalaliFromIso(isoDate: string): string {
  return formatJalaliDate(new Date(`${isoDate}T00:00:00Z`));
}
