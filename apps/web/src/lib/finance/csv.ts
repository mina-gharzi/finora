import { NO_CATEGORY_LABEL, TRANSACTION_TYPE_LABELS } from "./transaction-labels";
import type { TransactionHistoryItem } from "./transactions";

/**
 * Pure CSV serialization for the transaction-history export.
 *
 * Format contract (documented here so spreadsheet behaviour is predictable):
 * - UTF-8 with a leading BOM (`﻿`), which is what Excel and LibreOffice
 *   need to detect Persian text correctly.
 * - RFC 4180 fields and quoting: cells containing `"`, `,`, CR or LF are
 *   wrapped in double quotes and inner quotes are doubled.
 * - `\r\n` line endings.
 * - Dates are the stored Gregorian calendar date, `YYYY-MM-DD`, verbatim:
 *   the value is a calendar date, not an instant, so no time zone is applied
 *   and the exported date can never shift by a day.
 * - Amounts are plain positive integers (no separators, no unit suffix) so
 *   spreadsheets can sum them directly; the direction lives in the type column.
 * - Text cells are guarded against spreadsheet formula injection by prefixing
 *   a leading apostrophe when the value starts with a formula-triggering
 *   character (`=`, `+`, `-`, `@`, TAB or CR, ignoring leading spaces).
 *
 * This module is intentionally free of `server-only` and database imports so
 * it can be unit tested in isolation.
 */

/** Byte-order mark that makes spreadsheet apps treat the file as UTF-8. */
export const CSV_UTF8_BOM = "\uFEFF";

/** Content type for the export download. */
export const TRANSACTIONS_CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

const CSV_EOL = "\r\n";

/** RFC 4180: fields with separators, quotes or line breaks must be quoted. */
const NEEDS_QUOTING = /["\r\n,]/;

/** A cell that a spreadsheet may interpret as a formula when opened. */
const FORMULA_TRIGGER = /^[\t\r ]*[=+\-@]/;

/**
 * Neutralizes formula injection: a leading apostrophe forces spreadsheet apps
 * to treat the cell as literal text. Applied to untrusted text (notes,
 * account/category names); machine-generated numbers and dates never pass
 * through here.
 */
function guardFormula(text: string): string {
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text;
}

/** Escapes one field per RFC 4180, with the formula-injection guard applied. */
export function escapeCsvField(value: string): string {
  const guarded = guardFormula(value);
  if (!NEEDS_QUOTING.test(guarded)) {
    return guarded;
  }
  return `"${guarded.replaceAll('"', '""')}"`;
}

/** One data row of the export, in the documented column order. */
export interface TransactionCsvRow {
  /** Gregorian `YYYY-MM-DD`, exported verbatim. */
  occurredOn: string;
  /** Persian type label (درآمد/هزینه). */
  typeLabel: string;
  /** Plain integer Toman. */
  amount: number;
  accountName: string;
  categoryName: string | null;
  note: string;
}

/** Persian column headers, in the documented export order. */
export const TRANSACTION_CSV_HEADERS = [
  "تاریخ (میلادی)",
  "نوع تراکنش",
  "مبلغ (تومان)",
  "حساب",
  "دسته‌بندی",
  "توضیحات",
] as const;

/** Maps a history item onto a CSV row, applying the Persian labels. */
export function toTransactionCsvRow(
  item: TransactionHistoryItem,
): TransactionCsvRow {
  return {
    occurredOn: item.occurredOn,
    typeLabel: TRANSACTION_TYPE_LABELS[item.type],
    amount: item.amount,
    accountName: item.accountName,
    categoryName: item.categoryName,
    note: item.note,
  };
}

function toCsvLine(row: TransactionCsvRow): string {
  return [
    // Dates and amounts are machine-generated and safe to emit unguarded.
    row.occurredOn,
    escapeCsvField(row.typeLabel),
    String(row.amount),
    escapeCsvField(row.accountName),
    escapeCsvField(row.categoryName ?? NO_CATEGORY_LABEL),
    escapeCsvField(row.note),
  ].join(",");
}

/**
 * Serializes the given rows into a complete CSV document (headers first).
 * An empty list yields a headers-only file, which is still valid CSV.
 */
export function buildTransactionsCsv(rows: readonly TransactionCsvRow[]): string {
  const lines = [TRANSACTION_CSV_HEADERS.join(","), ...rows.map(toCsvLine)];
  return `${lines.join(CSV_EOL)}${CSV_EOL}`;
}

/**
 * A safe, ASCII-only download filename stamped with the export date (UTC), so
 * it needs no Content-Disposition encoding. Example:
 * `finora-transactions-2026-10-18.csv`.
 */
export function transactionsCsvFilename(exportedOn: string): string {
  return `finora-transactions-${exportedOn}.csv`;
}

/** The full download payload: BOM-prefixed CSV body plus its filename. */
export function buildTransactionsCsvExport(
  items: readonly TransactionHistoryItem[],
  exportedOn: string,
): { body: string; filename: string } {
  const rows = items.map(toTransactionCsvRow);
  return {
    body: CSV_UTF8_BOM + buildTransactionsCsv(rows),
    filename: transactionsCsvFilename(exportedOn),
  };
}

/** Today's calendar date as `YYYY-MM-DD`, anchored to UTC. */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
