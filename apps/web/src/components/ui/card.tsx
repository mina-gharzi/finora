import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-b border-border px-5 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level used for the title. Defaults to h2. */
  as?: "h2" | "h3" | "h4";
}

export function CardTitle({
  as: Heading = "h2",
  className,
  children,
  ...props
}: CardTitleProps) {
  return (
    <Heading
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    >
      {children}
    </Heading>
  );
}

export function CardDescription({ className, children, ...props }: CardProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: CardProps) {
  return (
    <div className={cn("px-5 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-border px-5 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
