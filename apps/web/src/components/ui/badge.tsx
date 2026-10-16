import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-surface-muted text-muted-foreground border-border",
  primary: "bg-primary-subtle text-primary border-transparent",
  success: "bg-success-subtle text-success border-transparent",
  warning: "bg-warning-subtle text-warning border-transparent",
  danger: "bg-danger-subtle text-danger border-transparent",
  info: "bg-info-subtle text-info border-transparent",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  variant = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
