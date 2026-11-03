import type { MobileTransfersResponse } from "@finora/shared";
import { listTransfers } from "@/lib/finance/transfers";
import { authenticateMobileRequest, mobileJson } from "@/lib/mobile/http";

/** Most recent transfers returned to the mobile client. */
const TRANSFER_LIMIT = 100;

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
