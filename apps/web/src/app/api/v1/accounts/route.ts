import type { MobileAccountsResponse } from "@finora/shared";
import { getAccountBalances } from "@/lib/finance/dashboard";
import { authenticateMobileRequest, mobileJson } from "@/lib/mobile/http";

/**
 * GET /api/v1/accounts
 *
 * Every owned account, archived ones included, with its current balance over
 * full history. Delegates entirely to the dashboard domain query.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const accounts = await getAccountBalances(auth.userId);

  const response: MobileAccountsResponse = {
    items: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      archived: account.archived,
      balance: account.balance,
    })),
  };

  return mobileJson(response);
}
