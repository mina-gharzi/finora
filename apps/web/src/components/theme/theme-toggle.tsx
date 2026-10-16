"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isTheme, type Theme } from "@/lib/theme";

/**
 * The theme lives on `<html data-theme>`, written by the inline pre-hydration
 * script and by this toggle. React subscribes to that attribute as an external
 * store instead of copying it into local state, so the control always mirrors
 * the document (including when the script picked the OS preference).
 */
function subscribeToThemeAttribute(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getThemeSnapshot(): Theme {
  const current = document.documentElement.getAttribute("data-theme");
  return isTheme(current) ? current : DEFAULT_THEME;
}

function getServerThemeSnapshot(): Theme {
  return DEFAULT_THEME;
}

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useSyncExternalStore(
    subscribeToThemeAttribute,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage may be unavailable (private mode); the document attribute still applies.
    }
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="حالت تیره"
      aria-pressed={isDark}
      title="تغییر حالت نمایش"
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  );
}
