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
}

export interface MobileApiError {
  error: "bad_request" | "unauthorized" | "rate_limited";
  message: string;
}
