import { addDays, jalaliParts } from "./dashboard-range";
import type { RecurringFrequency } from "./types";

/**
 * Pure schedule expansion for recurring rules. No database or session access:
 * the caller supplies the watermark (`afterExclusive`) and the inclusive upper
 * bound, which keeps generation deterministic and unit-testable.
 */

export const MAX_RECURRING_OCCURRENCES = 400;

export interface RecurringScheduleRule {
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
  startOn: string;
  endOn: string | null;
}

/** True when `iso` is the last day of its Jalali month. */
function isLastJalaliDay(iso: string): boolean {
  const current = jalaliParts(iso);
  const next = jalaliParts(addDays(iso, 1));
  return next.year !== current.year || next.month !== current.month;
}

function matchesRule(iso: string, rule: RecurringScheduleRule): boolean {
  if (rule.frequency === "weekly") {
    return (
      rule.weekday !== null &&
      new Date(`${iso}T00:00:00Z`).getUTCDay() === rule.weekday
    );
  }

  if (rule.dayOfMonth === null) {
    return false;
  }

  const { day } = jalaliParts(iso);
  if (day === rule.dayOfMonth) {
    return true;
  }

  // A day beyond the month's length fires on the month's last day instead.
  return isLastJalaliDay(iso) && rule.dayOfMonth > day;
}

/**
 * Dates a rule occurs on, ascending, strictly after `afterExclusive` and at
 * most through `throughInclusive`. `startOn`/`endOn` are inclusive, and at most
 * `MAX_RECURRING_OCCURRENCES` results are returned.
 */
export function occurrencesBetween(
  rule: RecurringScheduleRule,
  afterExclusive: string | null,
  throughInclusive: string,
): string[] {
  const through =
    rule.endOn !== null && rule.endOn < throughInclusive
      ? rule.endOn
      : throughInclusive;

  let cursor = rule.startOn;
  if (afterExclusive !== null) {
    const next = addDays(afterExclusive, 1);
    if (next > cursor) {
      cursor = next;
    }
  }

  const occurrences: string[] = [];
  while (cursor <= through && occurrences.length < MAX_RECURRING_OCCURRENCES) {
    if (matchesRule(cursor, rule)) {
      occurrences.push(cursor);
    }
    cursor = addDays(cursor, 1);
  }

  return occurrences;
}
