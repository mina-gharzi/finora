import type { MobileTransactionsResponse } from "@finora/shared";
import {
  parseTransactionHistoryQuery,
  transactionSearchParamsToRecord,
} from "@/lib/finance/history-query";
import { listTransactionHistory } from "@/lib/finance/transactions";
import { authenticateMobileRequest, mobileJson } from "@/lib/mobile/http";

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
