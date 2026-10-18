import { z } from "zod";
import { TRANSACTION_TYPES, type TransactionType } from "./types";
import { isoDateSchema } from "./validation";

/**
 * Query contract for the transaction-history view.
 *
 * This module is intentionally free of `server-only` and of any database
 * import: it is pure parsing/formatting so it can be unit tested in isolation
 * and reused by the page. The list itself is never trusted from here — the data
 * access layer always re-applies the session user's scope.
 */

/** Rows fetched per page. One extra row is read to detect a further page. */
export const TRANSACTION_HISTORY_PAGE_SIZE = 20;

/** Upper bound on the page number, so a crafted offset cannot walk arbitrarily far. */
export const MAX_TRANSACTION_HISTORY_PAGE = 10_000;

export interface TransactionHistoryFilters {
  type: TransactionType | null;
  accountId: string | null;
  /** Inclusive Gregorian lower bound, `YYYY-MM-DD`. */
  from: string | null;
  /** Inclusive Gregorian upper bound, `YYYY-MM-DD`. */
  to: string | null;
}

export interface TransactionHistoryQuery extends TransactionHistoryFilters {
  page: number;
}

/** Raw `searchParams` shape as provided by Next.js. */
export type TransactionHistorySearchParams = Record<
  string,
  string | string[] | undefined
>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Every field falls back to a safe default instead of failing, so a malformed or
 * hostile query string can never widen access or throw. In particular the owner
 * id is never read from the URL; it always comes from the session in the DAL.
 */
const historyQuerySchema = z.object({
  type: z.enum(TRANSACTION_TYPES).nullable().catch(null),
  accountId: z.uuid().nullable().catch(null),
  from: isoDateSchema.nullable().catch(null),
  to: isoDateSchema.nullable().catch(null),
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_TRANSACTION_HISTORY_PAGE)
    .catch(1),
});

/** Validates untrusted `searchParams` into a normalized, always-usable query. */
export function parseTransactionHistoryQuery(
  params: TransactionHistorySearchParams,
): TransactionHistoryQuery {
  const parsed = historyQuerySchema.safeParse({
    type: firstValue(params.type),
    accountId: firstValue(params.accountId),
    from: firstValue(params.from),
    to: firstValue(params.to),
    page: firstValue(params.page),
  });

  if (parsed.success) {
    return parsed.data;
  }

  return { type: null, accountId: null, from: null, to: null, page: 1 };
}

/** True when any narrowing filter is applied (used to pick the empty state). */
export function hasActiveTransactionFilters(
  query: TransactionHistoryFilters,
): boolean {
  return Boolean(query.type || query.accountId || query.from || query.to);
}

/** Builds a `/transactions` link preserving the current filters and page. */
export function buildTransactionHistoryHref(
  query: TransactionHistoryQuery,
  page: number,
): string {
  const search = new URLSearchParams();
  if (query.type) search.set("type", query.type);
  if (query.accountId) search.set("accountId", query.accountId);
  if (query.from) search.set("from", query.from);
  if (query.to) search.set("to", query.to);
  if (page > 1) search.set("page", String(page));

  const queryString = search.toString();
  return queryString ? `/transactions?${queryString}` : "/transactions";
}

/**
 * Builds the CSV export link for the given filters. The page number is
 * deliberately NOT included: an export always covers every matching record,
 * not just the visible page.
 */
export function buildTransactionExportHref(
  query: TransactionHistoryFilters,
): string {
  const search = new URLSearchParams();
  if (query.type) search.set("type", query.type);
  if (query.accountId) search.set("accountId", query.accountId);
  if (query.from) search.set("from", query.from);
  if (query.to) search.set("to", query.to);

  const queryString = search.toString();
  return queryString ? `/transactions/export?${queryString}` : "/transactions/export";
}

/**
 * Converts a `URLSearchParams` into the record shape the parser accepts,
 * keeping the FIRST value of a repeated parameter so the export route
 * resolves a query string exactly like the history page does.
 */
export function transactionSearchParamsToRecord(
  params: URLSearchParams,
): TransactionHistorySearchParams {
  const record: TransactionHistorySearchParams = {};
  for (const [key, value] of params) {
    if (!(key in record)) {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Builds the edit link for `transactionId`, carrying the current history filters
 * and page as a `returnTo` parameter so a successful save returns the user to
 * exactly where they were.
 */
export function buildTransactionEditHref(
  transactionId: string,
  query: TransactionHistoryQuery,
  page: number,
): string {
  const returnTo = buildTransactionHistoryHref(query, page);
  return `/transactions/${encodeURIComponent(
    transactionId,
  )}/edit?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Normalizes an untrusted `returnTo` value into a safe same-app history path.
 * Anything that is not a plain `/transactions` path is discarded, so a crafted
 * value can never turn a post-save redirect into an open redirect. The default
 * is the unfiltered history page.
 */
export function parseTransactionReturnTo(
  value: string | string[] | undefined,
): string {
  const raw = firstValue(value);
  if (!raw) {
    return "/transactions";
  }
  return /^\/transactions(?:\?[^\s]*)?$/.test(raw) ? raw : "/transactions";
}
