import type { RecurringFrequency } from "./types";

/**
 * Weekday choices for weekly rules. `value` is the JS `getUTCDay` number used
 * by the domain schema, while the label is the Persian day name.
 */
export const WEEKDAY_OPTIONS = [
  { value: 6, label: "شنبه" },
  { value: 0, label: "یکشنبه" },
  { value: 1, label: "دوشنبه" },
  { value: 2, label: "سه‌شنبه" },
  { value: 3, label: "چهارشنبه" },
  { value: 4, label: "پنجشنبه" },
  { value: 5, label: "جمعه" },
] as const;

/** Persian label for a JS `getUTCDay` value, or an empty string when absent. */
export function weekdayLabel(value: number | null): string {
  return WEEKDAY_OPTIONS.find((option) => option.value === value)?.label ?? "";
}

export interface RecurrencePattern {
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
}

/** Human-readable Persian summary of a rule's schedule. */
export function describeRecurrence(rule: RecurrencePattern): string {
  if (rule.frequency === "monthly") {
    return rule.dayOfMonth === null
      ? "هر ماه (تقویم شمسی)"
      : `هر ماه، روز ${rule.dayOfMonth} (تقویم شمسی)`;
  }
  return `هر هفته، ${weekdayLabel(rule.weekday)}`;
}
