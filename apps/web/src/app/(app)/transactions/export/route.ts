import { requireUserId } from "@/lib/dal";
import {
  buildTransactionsCsvExport,
  todayIsoDate,
  TRANSACTIONS_CSV_CONTENT_TYPE,
} from "@/lib/finance/csv";
import {
  parseTransactionHistoryQuery,
  transactionSearchParamsToRecord,
} from "@/lib/finance/history-query";
import { listTransactionHistoryForExport } from "@/lib/finance/transactions";

/**
 * `GET /transactions/export` — downloads the signed-in user's transactions as
 * a UTF-8 CSV file, honouring the same `type`, `accountId`, `from` and `to`
 * filters as the history page.
 *
 * Security model:
 * - The owner is taken exclusively from the verified session via
 *   `requireUserId()`; no user id is ever read from the query string. An
 *   unauthenticated request is redirected to the login page.
 * - Query parameters go through the same `parseTransactionHistoryQuery`
 *   contract as the page: malformed values are dropped, never trusted.
 * - The database query is user-scoped with the filters pushed down in SQL, so
 *   a foreign `accountId` yields an empty file instead of foreign rows.
 * - Unlike the page, there is no pagination: every matching record is
 *   exported.
 */

export async function GET(request: Request): Promise<Response> {
  const userId = await requireUserId();

  const query = parseTransactionHistoryQuery(
    transactionSearchParamsToRecord(new URL(request.url).searchParams),
  );
  // Only the narrowing filters matter for an export; the page field of the
  // shared query contract is deliberately dropped.
  const filters = {
    type: query.type,
    accountId: query.accountId,
    from: query.from,
    to: query.to,
  };

  const items = await listTransactionHistoryForExport(userId, filters);
  const { body, filename } = buildTransactionsCsvExport(items, todayIsoDate());

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": TRANSACTIONS_CSV_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      // User-scoped financial data must never be cached by proxies or the
      // browser.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
