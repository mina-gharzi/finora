export const MOBILE_DASHBOARD_PERIODS = [
  "this-month",
  "prev-month",
  "all-time",
] as const;

export type MobileDashboardPeriod = (typeof MOBILE_DASHBOARD_PERIODS)[number];

export type MobileAccountType = "cash" | "bank" | "wallet";
export type MobileTransactionType = "income" | "expense";

export interface MobileAuthUser {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
}

export interface MobileLoginResponse {
  token: string;
  expiresAt: string;
  user: MobileAuthUser;
}

export interface MobileTokenPair {
  accessToken: string;
  /** ISO timestamp at which the access token stops working. */
  accessTokenExpiresAt: string;
  refreshToken: string;
  /** ISO timestamp at which the refresh token stops working. */
  refreshTokenExpiresAt: string;
}

export type MobileAuthLoginResponse = MobileTokenPair & {
  user: MobileLoginResponse["user"];
};

export interface MobileRefreshRequest {
  refreshToken: string;
}

export interface MobileApiErrorResponse {
  error: string;
  message: string;
}

export interface MobileOverviewTotals {
  income: number;
  expense: number;
  net: number;
}

export interface MobileOverviewCategory {
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
}

export interface MobileOverviewAccount {
  id: string;
  name: string;
  type: MobileAccountType;
  balance: number;
}

export interface MobileOverviewTransaction {
  id: string;
  type: MobileTransactionType;
  amount: number;
  occurredOn: string;
  note: string;
  accountName: string;
  categoryName: string | null;
}

export interface MobileOverviewResponse {
  period: MobileDashboardPeriod;
  rangeLabel: string;
  totals: MobileOverviewTotals;
  categoryBreakdown: MobileOverviewCategory[];
  accountBalances: MobileOverviewAccount[];
  recentTransactions: MobileOverviewTransaction[];
  hasAccounts: boolean;
  hasTransactions: boolean;
  hasBudgets: boolean;
}

export interface MobileApiError {
  error: "bad_request" | "unauthorized" | "rate_limited";
  message: string;
}

/** One owned account with its current balance; archived accounts included. */
export interface MobileAccount {
  id: string;
  name: string;
  type: MobileAccountType;
  archived: boolean;
  balance: number;
}

export interface MobileAccountsResponse {
  items: MobileAccount[];
}

export interface MobileCategory {
  id: string;
  name: string;
  kind: MobileTransactionType;
  archived: boolean;
}

export interface MobileCategoriesResponse {
  items: MobileCategory[];
}

/** One paginated transaction-history row. */
export interface MobileTransactionHistoryItem {
  id: string;
  type: MobileTransactionType;
  amount: number;
  occurredOn: string;
  note: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
}

export interface MobileTransactionsResponse {
  items: MobileTransactionHistoryItem[];
  page: number;
  pageSize: number;
  total: number;
}

export type MobileBudgetStatus =
  | "ok"
  | "approaching"
  | "reached"
  | "exceeded";

export interface MobileBudgetProgress {
  limit: number;
  spending: number;
  remaining: number;
  percent: number;
  status: MobileBudgetStatus;
  overspend: number;
}

export interface MobileBudgetCategory {
  id: string;
  name: string;
  archived: boolean;
}

export interface MobileBudget {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryArchived: boolean;
  monthStart: string;
  limitAmount: number;
  progress: MobileBudgetProgress;
}

export interface MobileBudgetsResponse {
  monthStart: string;
  monthEnd: string;
  expenseCategories: MobileBudgetCategory[];
  budgets: MobileBudget[];
  hasExpenseCategories: boolean;
}

export interface MobileTransfer {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  occurredOn: string;
  note: string;
}

export interface MobileTransfersResponse {
  items: MobileTransfer[];
}

/** Persisted account returned by create/archive (public fields only). */
export interface MobileAccountRecord {
  id: string;
  name: string;
  type: MobileAccountType;
  openingBalance: number;
  archived: boolean;
}

/** Persisted category returned by create/rename/archive. */
export interface MobileCategoryRecord {
  id: string;
  name: string;
  kind: MobileTransactionType;
  archived: boolean;
}

/** Persisted transaction returned by create/update. */
export interface MobileTransactionRecord {
  id: string;
  type: MobileTransactionType;
  amount: number;
  occurredOn: string;
  note: string;
  accountId: string;
  categoryId: string | null;
}

/** Persisted budget returned by create/update. */
export interface MobileBudgetRecord {
  id: string;
  categoryId: string;
  monthStart: string;
  limitAmount: number;
}

/** Persisted transfer returned by create. */
export interface MobileTransferRecord {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredOn: string;
  note: string;
}

/** Body of every successful delete. */
export interface MobileOkResponse {
  ok: true;
}
