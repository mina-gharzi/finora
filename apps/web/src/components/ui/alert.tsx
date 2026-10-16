import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  AlertIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@/components/icons";

export type AlertVariant = "info" | "success" | "warning" | "danger";

const variants: Record<
  AlertVariant,
  { container: string; icon: ReactNode }
> = {
  info: { container: "bg-info-subtle text-info", icon: <InfoIcon /> },
  success: {
    container: "bg-success-subtle text-success",
    icon: <CheckCircleIcon />,
  },
  warning: { container: "bg-warning-subtle text-warning", icon: <AlertIcon /> },
  danger: { container: "bg-danger-subtle text-danger", icon: <AlertIcon /> },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

export function Alert({
  variant = "info",
  title,
  className,
  children,
  ...props
}: AlertProps) {
  const { container, icon } = variants[variant];
  const isAssertive = variant === "danger";

  return (
    <div
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-transparent px-4 py-3 text-sm",
        container,
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className="text-foreground/90">{children}</div>
      </div>
    </div>
  );
}
