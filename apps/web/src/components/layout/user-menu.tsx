import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/dal";

/**
 * Server component that reads the verified session and renders the signed-in
 * user plus a logout control. It must be rendered inside a Suspense boundary
 * because it reads cookies.
 */
export async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline">
        {user.name}
      </span>
      <form action={logoutAction}>
        <Button type="submit" variant="secondary" size="sm">
          خروج
        </Button>
      </form>
    </div>
  );
}
