import type {
  MobileAccountRecord,
  MobileAccountsResponse,
} from "@finora/shared";
import { createAccount } from "@/lib/finance/accounts";
import { getAccountBalances } from "@/lib/finance/dashboard";
import { ensureRecurringUpToDateSafe } from "@/lib/finance/recurring";
import {
  authenticateMobileRequest,
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileBadRequest,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";
import { withIdempotency } from "@/lib/mobile/idempotency";

function toAccountRecord(account: {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  archived: boolean;
}): MobileAccountRecord {
  return {
    id: account.id,
    name: account.name,
    type: account.type as MobileAccountRecord["type"],
    openingBalance: account.openingBalance,
    archived: account.archived,
  };
}

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

  await ensureRecurringUpToDateSafe(auth.userId);

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

/**
 * POST /api/v1/accounts
 *
 * Creates an account for the authenticated, verified owner. Validation and
 * ownership are entirely the domain layer's responsibility.
 */
export async function POST(request: Request) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  return withIdempotency(request, auth.userId, async () => {
    const body = await readJsonObject(request);
    if (!body) {
      return mobileBadRequest();
    }

    const result = await createAccount(auth.userId, body);
    if (!result.ok) {
      return mapDomainFailure(result);
    }

    return mobileJson(toAccountRecord(result.account), 201);
  });
}
