import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-foreground",
        "peer-disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}
