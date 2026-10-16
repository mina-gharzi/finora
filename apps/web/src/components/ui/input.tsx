import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marks the control as invalid and wires the error styling. */
  invalid?: boolean;
}

const base =
  "block w-full rounded-md border bg-surface px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-colors " +
  "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground";

export function Input({ className, invalid = false, ...props }: InputProps) {
  return (
    <input
      className={cn(
        base,
        "h-10",
        invalid
          ? "border-danger focus-visible:outline-danger"
          : "border-border-strong",
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
