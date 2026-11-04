import type {
  MobileTransferRecord,
  MobileTransfersResponse,
} from "@finora/shared";
import { createTransfer, listTransfers } from "@/lib/finance/transfers";
import {
  authenticateMobileRequest,
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileBadRequest,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";
import { withIdempotency } from "@/lib/mobile/idempotency";

/** Most recent transfers returned to the mobile client. */
const TRANSFER_LIMIT = 100;

function toTransferRecord(transfer: {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredOn: string;
  note: string;
}): MobileTransferRecord {
  return {
    id: transfer.id,
    fromAccountId: transfer.fromAccountId,
    toAccountId: transfer.toAccountId,
    amount: transfer.amount,
    occurredOn: transfer.occurredOn,
    note: transfer.note,
  };
}

/**
 * GET /api/v1/transfers
 *
 * The 100 most recent transfers between the owner's accounts.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const transfers = await listTransfers(auth.userId, TRANSFER_LIMIT);

  const response: MobileTransfersResponse = {
    items: transfers.map((transfer) => ({
      id: transfer.id,
      fromAccountId: transfer.fromAccountId,
      fromAccountName: transfer.fromAccountName,
      toAccountId: transfer.toAccountId,
      toAccountName: transfer.toAccountName,
      amount: transfer.amount,
      occurredOn: transfer.occurredOn,
      note: transfer.note,
    })),
  };

  return mobileJson(response);
}

/**
 * POST /api/v1/transfers
 *
 * Creates a transfer between two of the owner's accounts. The domain verifies
 * both accounts, their ownership and that neither is archived.
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

    const result = await createTransfer(auth.userId, body);
    if (!result.ok) {
      return mapDomainFailure(result);
    }

    return mobileJson(toTransferRecord(result.transfer), 201);
  });
}
