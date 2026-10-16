import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type FieldProps = HTMLAttributes<HTMLDivElement>;

/** Vertical layout wrapper for a label + control + message group. */
export function Field({ className, children, ...props }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      {children}
    </div>
  );
}
