import type {
  MobileDashboardPeriod,
  MobileOverviewResponse,
} from "@finora/shared";
import { parseDashboardPeriod } from "@/lib/finance/dashboard-range";
import { authenticateMobileRequest, mobileJson } from "@/lib/mobile/http";
import { buildMobileOverview } from "@/lib/mobile/overview";

/**
 * GET /api/v1/overview?period=this-month|prev-month|all-time
 *
 * Versioned alias of the legacy mobile overview, sharing its builder.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const period: MobileDashboardPeriod = parseDashboardPeriod(
    searchParams.get("period") ?? undefined,
  );

  const response: MobileOverviewResponse = await buildMobileOverview(
    auth.userId,
    period,
  );

  return mobileJson(response);
}
