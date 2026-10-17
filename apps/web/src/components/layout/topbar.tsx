"use client";

import type { ReactNode } from "react";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Brand } from "./brand";

export interface TopbarProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** Optional trailing controls (e.g. the signed-in user menu). */
  actions?: ReactNode;
}

export function Topbar({ menuOpen, onToggleMenu, actions }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <button
        type="button"
        onClick={onToggleMenu}
        aria-label={menuOpen ? "بستن منو" : "باز کردن منو"}
        aria-expanded={menuOpen}
        aria-controls="mobile-nav"
        className="inline-flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground lg:hidden"
      >
        <span aria-hidden="true" className="inline-flex">
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </span>
      </button>

      <Brand className="lg:hidden" />

      <div className="flex-1" />

      {actions}
      <ThemeToggle />
    </header>
  );
}
