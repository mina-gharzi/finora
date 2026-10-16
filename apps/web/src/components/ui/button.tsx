import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
  "transition-colors select-none " +
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-surface-muted",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  danger: "bg-danger text-danger-foreground hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true, disables the button and exposes a busy state to assistive tech. */
  loading?: boolean;
  /** Optional leading icon (ignored while loading, which shows a spinner). */
  leadingIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" label={null} /> : leadingIcon}
      {children}
    </button>
  );
}
