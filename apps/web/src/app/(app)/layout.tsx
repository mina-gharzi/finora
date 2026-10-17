import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { UserMenu } from "@/components/layout/user-menu";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      headerActions={
        <Suspense fallback={null}>
          <UserMenu />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
