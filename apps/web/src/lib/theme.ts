export const THEME_STORAGE_KEY = "finora-theme";

export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Inline script executed synchronously in <head> (before first paint) to apply
 * the stored theme, or the OS preference when none is stored. This avoids the
 * flash of the wrong theme and, paired with `suppressHydrationWarning` on
 * <html>, avoids a hydration mismatch.
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var s=localStorage.getItem(k);var t=(s==="light"||s==="dark")?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
