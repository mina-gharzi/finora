import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export interface NavItemProps {
  label: string;
  icon?: ReactNode;
  /** Destination. When omitted, the item renders as a disabled placeholder. */
  href?: string;
  /** Marks the current page for assistive technology. */
  active?: boolean;
  /** Renders a non-interactive placeholder (e.g. a not-yet-built page). */
  disabled?: boolean;
  /** Optional trailing content such as a "coming soon" badge. */
  badge?: ReactNode;
}

export function NavItem({
  label,
  icon,
  href,
  active = false,
  disabled = false,
  badge,
}: NavItemProps) {
  const isPlaceholder = disabled || !href;

  const content = (
    <>
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </>
  );

  const base =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";

  if (isPlaceholder) {
    return (
      <li>
        <span
          aria-disabled="true"
          className={cn(base, "cursor-not-allowed text-disabled-foreground")}
        >
          {content}
        </span>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          base,
          active
            ? "bg-primary-subtle text-primary"
            : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        )}
      >
        {content}
      </Link>
    </li>
  );
}
