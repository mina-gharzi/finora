import { NextResponse } from "next/server";
import type { MobileDashboardPeriod } from "@finora/shared";
import { parseDashboardPeriod } from "@/lib/finance/dashboard-range";
import { verifyMobileBearerToken } from "@/lib/mobile/auth";
import { buildMobileOverview } from "@/lib/mobile/overview";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = await verifyMobileBearerToken(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const { searchParams } = new URL(request.url);
  const period: MobileDashboardPeriod = parseDashboardPeriod(
    searchParams.get("period") ?? undefined,
  );

  const response = await buildMobileOverview(auth.userId, period);

  return NextResponse.json(response, { status: 200, headers: NO_STORE });
}
