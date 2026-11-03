import type { MobileAccountRecord } from "@finora/shared";
import {
  deleteAccount,
  setAccountArchived,
} from "@/lib/finance/accounts";
import {
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileBadRequest,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";

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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/accounts/[id]
 *
 * Archives or unarchives the owned account.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body || typeof body.archived !== "boolean") {
    return mobileBadRequest();
  }

  const result = await setAccountArchived(auth.userId, id, body.archived);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson(toAccountRecord(result.account));
}

/**
 * DELETE /api/v1/accounts/[id]
 *
 * Deletes an owned account. The domain refuses accounts that still have
 * transactions and reports `has_transactions` with the count.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const result = await deleteAccount(auth.userId, id);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson({ ok: true });
}
