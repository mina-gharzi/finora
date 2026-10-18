import type { TransactionType } from "./types";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "درآمد",
  expense: "هزینه",
};

/** Label for the optional "no category" choice in the category picker. */
export const NO_CATEGORY_LABEL = "بدون دسته‌بندی";
