"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { NavItem } from "@/components/ui/nav-item";
import { COMING_SOON_LABEL, navGroups } from "./nav-config";

export interface MobileNavProps {
  open: boolean;
  activePath?: string;
  onNavigate: () => void;
}

export function MobileNav({ open, activePath, onNavigate }: MobileNavProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onNavigate();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onNavigate]);

  return (
    <nav
      id="mobile-nav"
      aria-label="ناوبری موبایل"
      hidden={!open}
      onClick={onNavigate}
      className="border-b border-border bg-surface px-3 py-4 lg:hidden"
    >
      <ul className="flex flex-col gap-4">
        {navGroups.map((group) => (
          <li key={group.title}>
            <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">
              {group.title}
            </p>
            <ul className="flex flex-col gap-1">
              {group.items.map((item) => (
                <NavItem
                  key={item.key}
                  label={item.label}
                  icon={item.icon}
                  href={item.href}
                  disabled={item.disabled}
                  active={!item.disabled && item.href === activePath}
                  badge={
                    item.disabled ? (
                      <Badge variant="neutral">{COMING_SOON_LABEL}</Badge>
                    ) : undefined
                  }
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
