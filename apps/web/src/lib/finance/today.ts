/**
 * The calendar date in Tehran, where the app's users live. Iran is UTC+03:30
 * with no daylight saving, so a plain UTC date is wrong for the first 3.5 hours
 * of every local day.
 */
export function todayInTehranIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
