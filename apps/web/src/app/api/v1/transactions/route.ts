import type {
  MobileTransactionRecord,
  MobileTransactionsResponse,
  MobileTransactionType,
} from "@finora/shared";
import {
  parseTransactionHistoryQuery,
  transactionSearchParamsToRecord,
} from "@/lib/finance/history-query";
import {
  createTransaction,
  listTransactionHistory,
} from "@/lib/finance/transactions";
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

/**
 * GET /api/v1/transactions?type=&accountId=&from=&to=&q=&page=
 *
 * Paginated transaction history. Query parsing and the DAL call are the exact
 * ones the web history page uses, so filters and pagination behave identically.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  await ensureRecurringUpToDateSafe(auth.userId);

  const { searchParams } = new URL(request.url);
  const query = parseTransactionHistoryQuery(
    transactionSearchParamsToRecord(searchParams),
  );
  const result = await listTransactionHistory(auth.userId, query);

  const response: MobileTransactionsResponse = {
    items: result.items.map((item) => ({
      id: item.id,
      type: item.type,
      amount: item.amount,
      occurredOn: item.occurredOn,
      note: item.note,
      accountId: item.accountId,
      accountName: item.accountName,
      categoryId: item.categoryId ?? null,
      categoryName: item.categoryName,
    })),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  };

  return mobileJson(response);
}

/**
 * POST /api/v1/transactions
 *
 * Creates a transaction for the authenticated, verified owner. The domain
 * validates the payload, including that referenced account/category are owned.
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

    const result = await createTransaction(auth.userId, body);
    if (!result.ok) {
      return mapDomainFailure(result);
    }

    return mobileJson(toTransactionRecord(result.transaction), 201);
  });
}
