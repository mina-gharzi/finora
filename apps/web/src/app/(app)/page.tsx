import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";

async function AuthenticatedDashboard() {
  await requireUserId();
  return <DashboardView />;
}

function DashboardFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <AuthenticatedDashboard />
    </Suspense>
  );
}
