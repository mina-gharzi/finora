/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  isTheme,
  themeInitScript,
} from "@/lib/theme";

describe("theme constants", () => {
  it("defaults to the light theme", () => {
    expect(DEFAULT_THEME).toBe("light");
    expect(THEMES).toContain(DEFAULT_THEME);
    expect(THEMES).toEqual(["light", "dark"]);
  });
});

describe("isTheme", () => {
  it("accepts both supported themes", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it.each(["", "auto", "LIGHT", null, undefined, 0, 1, {}, []])(
    "rejects %j",
    (value) => {
      expect(isTheme(value)).toBe(false);
    },
  );
});

describe("themeInitScript", () => {
  it("is a single inline statement, ready for the document head", () => {
    expect(themeInitScript).toMatch(/^\(function\(\)\{/);
    expect(themeInitScript).toMatch(/\}\)\(\);\s*$/);
    // No newline: a newline inside a <script> would trigger a legacy
    // HTML comment parsing quirk and break the inline script.
    expect(themeInitScript).not.toContain("\n");
  });

  it("reads the persisted key before falling back to the OS preference", () => {
    expect(themeInitScript).toContain(`"${THEME_STORAGE_KEY}"`);
    expect(themeInitScript).toContain("localStorage.getItem");
    expect(themeInitScript).toContain("prefers-color-scheme: dark");
  });

  it.each(THEMES)(
    "restores the %s theme on data-theme",
    (theme) => {
      expect(themeInitScript).toContain(`"${theme}"`);
      expect(themeInitScript).toContain("document.documentElement");
      expect(themeInitScript).toContain("data-theme");
    },
  );

  it("swallows storage failures so the page still renders", () => {
    expect(themeInitScript).toMatch(/catch\(e\)\{\}/);
  });
});
