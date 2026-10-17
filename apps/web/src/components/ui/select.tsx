import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

const base =
  "block w-full rounded-md border bg-surface px-3 text-sm text-foreground transition-colors disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground";

export function Select({
  className,
  invalid = false,
  ...props
}: SelectProps) {
  return (
    <select
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
