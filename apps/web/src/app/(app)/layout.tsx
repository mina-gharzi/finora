import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/layout/user-menu";
import { VerifyEmailBanner } from "@/components/layout/verify-email-banner";
import { isEmailVerificationRequired } from "@/lib/env";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      headerActions={
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      }
    >
      {isEmailVerificationRequired() && (
        <Suspense fallback={null}>
          <VerifyEmailBanner />
        </Suspense>
      )}
      {children}
    </AppShell>
  );
}
