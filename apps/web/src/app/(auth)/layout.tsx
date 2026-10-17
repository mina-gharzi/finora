import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";

/**
 * Centered, chrome-free layout for the authentication routes. It sits outside
 * the `(app)` route group so the sidebar/topbar are not rendered.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <Brand />
        </div>
        {children}
      </div>
    </main>
  );
}
