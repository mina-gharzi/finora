export const ACCOUNT_KINDS = ["cash", "bank", "wallet"] as const;
export type FixtureAccountKind = (typeof ACCOUNT_KINDS)[number];

export const TRANSACTION_KINDS = ["income", "expense"] as const;
export type FixtureTransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface FixtureAccount {
  id: string;
  name: string;
  kind: FixtureAccountKind;
  balance: number;
}

export interface FixtureCategory {
  id: string;
  name: string;
  kind: FixtureTransactionKind;
}

export interface FixtureTransaction {
  id: string;
  accountId: string;
  categoryId: string;
  kind: FixtureTransactionKind;
  amount: number;
  occurredOn: string;
  note: string;
}

export interface OverviewFixture {
  asOf: string;
  accounts: FixtureAccount[];
  categories: FixtureCategory[];
  transactions: FixtureTransaction[];
}

export const overviewFixture: OverviewFixture = {
  asOf: "2026-10-22",
  accounts: [
    {
      id: "account-bank",
      name: "حساب اصلی",
      kind: "bank",
      balance: 58_400_000,
    },
    {
      id: "account-cash",
      name: "نقدی",
      kind: "cash",
      balance: 4_250_000,
    },
    {
      id: "account-wallet",
      name: "کیف پول",
      kind: "wallet",
      balance: 7_800_000,
    },
  ],
  categories: [
    { id: "category-salary", name: "حقوق", kind: "income" },
    { id: "category-housing", name: "خانه و اجاره", kind: "expense" },
    { id: "category-groceries", name: "خرید روزانه", kind: "expense" },
    { id: "category-restaurant", name: "رستوران و کافه", kind: "expense" },
    { id: "category-transport", name: "حمل‌ونقل", kind: "expense" },
    { id: "category-health", name: "سلامت", kind: "expense" },
  ],
  transactions: [
    {
      id: "transaction-salary",
      accountId: "account-bank",
      categoryId: "category-salary",
      kind: "income",
      amount: 42_000_000,
      occurredOn: "2026-10-01",
      note: "حقوق مهر",
    },
    {
      id: "transaction-rent",
      accountId: "account-bank",
      categoryId: "category-housing",
      kind: "expense",
      amount: 18_000_000,
      occurredOn: "2026-10-02",
      note: "اجاره ماهانه",
    },
    {
      id: "transaction-groceries",
      accountId: "account-bank",
      categoryId: "category-groceries",
      kind: "expense",
      amount: 3_850_000,
      occurredOn: "2026-10-20",
      note: "خرید هفتگی",
    },
    {
      id: "transaction-transport",
      accountId: "account-cash",
      categoryId: "category-transport",
      kind: "expense",
      amount: 620_000,
      occurredOn: "2026-10-21",
      note: "تاکسی",
    },
    {
      id: "transaction-lunch",
      accountId: "account-wallet",
      categoryId: "category-restaurant",
      kind: "expense",
      amount: 1_450_000,
      occurredOn: "2026-10-18",
      note: "ناهار کاری",
    },
    {
      id: "transaction-pharmacy",
      accountId: "account-cash",
      categoryId: "category-health",
      kind: "expense",
      amount: 980_000,
      occurredOn: "2026-10-22",
      note: "داروخانه",
    },
    {
      id: "transaction-cafe",
      accountId: "account-wallet",
      categoryId: "category-restaurant",
      kind: "expense",
      amount: 480_000,
      occurredOn: "2026-10-19",
      note: "کافه",
    },
  ],
};
