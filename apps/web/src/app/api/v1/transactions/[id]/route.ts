import type {
  MobileTransactionRecord,
  MobileTransactionType,
} from "@finora/shared";
import {
  deleteTransaction,
  updateTransaction,
} from "@/lib/finance/transactions";
import {
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileBadRequest,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";

function toTransactionRecord(transaction: {
  id: string;
  type: string;
  amount: number;
  occurredOn: string;
  note: string;
  accountId: string;
  categoryId: string | null;
}): MobileTransactionRecord {
  return {
    id: transaction.id,
    type: transaction.type as MobileTransactionType,
    amount: transaction.amount,
    occurredOn: transaction.occurredOn,
    note: transaction.note,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/transactions/[id]
 *
 * Full replacement of an owned transaction.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return mobileBadRequest();
  }

  const result = await updateTransaction(auth.userId, id, body);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson(toTransactionRecord(result.transaction));
}

/**
 * DELETE /api/v1/transactions/[id]
 *
 * Deletes an owned transaction; a missing/foreign id is the same 404.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const deleted = await deleteTransaction(auth.userId, id);
  if (!deleted) {
    return mapDomainFailure(false);
  }

  return mobileJson({ ok: true });
}
