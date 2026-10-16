export type ClassValue = string | number | null | false | undefined;

/**
 * Minimal className combiner.
 *
 * This intentionally does not resolve conflicting Tailwind utilities (that would
 * require an extra dependency). Component authors should therefore avoid passing
 * classes that fight the component's own base classes.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
