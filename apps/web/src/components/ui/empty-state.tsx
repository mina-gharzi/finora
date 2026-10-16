import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** Decorative icon shown above the title. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional call to action. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <span
          className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
