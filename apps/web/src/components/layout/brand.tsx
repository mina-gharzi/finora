import { cn } from "@/lib/cn";

export interface BrandProps {
  className?: string;
  /** Hides the wordmark, showing only the logo mark. */
  compact?: boolean;
}

export function Brand({ className, compact = false }: BrandProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground"
        aria-hidden="true"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 3v18" />
          <path d="M6 5h10l3 3-3 3H6" />
        </svg>
      </span>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-primary">
          فینورا
        </span>
      )}
    </span>
  );
}
