import assert from "node:assert/strict";
import test from "node:test";
import { formatJalaliDate, formatToman } from "@finora/shared";
import type { MobileOverviewResponse } from "@finora/shared";

import { overviewFixture } from "../data/fixtures.ts";
import { formatJalaliFromIso } from "./dates.ts";
import { formatSignedToman } from "./money.ts";
import { buildOverview, mapMobileOverview } from "./overview.ts";

test("builds the overview totals from local fixtures", () => {
  const overview = buildOverview(overviewFixture);

  assert.equal(overview.summary.balance, 70_450_000);
  assert.equal(overview.summary.income, 42_000_000);
  assert.equal(overview.summary.expense, 25_380_000);
  assert.equal(overview.summary.net, 16_620_000);
  assert.equal(overview.hasAccounts, true);
  assert.equal(overview.hasTransactions, true);
});

test("sorts the expense breakdown and recent transactions", () => {
  const overview = buildOverview(overviewFixture);

  assert.equal(overview.categoryBreakdown[0]?.name, "خانه و اجاره");
  assert.equal(overview.categoryBreakdown[0]?.amount, 18_000_000);
  assert.equal(overview.categoryBreakdown[0]?.percent, 71);
  assert.equal(overview.categoryBreakdown.length, 5);
  assert.equal(overview.recentTransactions.length, 5);
  assert.equal(overview.recentTransactions[0]?.note, "داروخانه");
});

test("formats amounts and dates with shared Latin-digit helpers", () => {
  assert.equal(formatToman(1_234_567), "1,234,567");
  assert.equal(formatSignedToman(-1_500), "\u22121,500 \u062A\u0648\u0645\u0627\u0646");
  assert.equal(
    formatJalaliFromIso("2026-10-22"),
    formatJalaliDate(new Date("2026-10-22T00:00:00Z")),
  );
  assert.match(formatJalaliFromIso("2026-10-22"), /^\d{4}\/\d{2}\/\d{2}$/);
});

test("keeps every fixture amount a safe integer", () => {
  for (const account of overviewFixture.accounts) {
    assert.equal(Number.isSafeInteger(account.balance), true);
  }

  for (const transaction of overviewFixture.transactions) {
    assert.equal(Number.isSafeInteger(transaction.amount), true);
  }
});

test("maps server overview DTOs without fixture fallbacks", () => {
  const response: MobileOverviewResponse = {
    period: "this-month",
    rangeLabel: "مهر ۱۴۰۵",
    totals: { income: 100_000, expense: 40_000, net: 60_000 },
    categoryBreakdown: [
      { categoryId: "c1", categoryName: "خوراک", amount: 30_000 },
      { categoryId: null, categoryName: null, amount: 10_000 },
    ],
    accountBalances: [
      { id: "a1", name: "نقدی", type: "cash", balance: 500_000 },
      { id: "a2", name: "بانک", type: "bank", balance: 250_000 },
    ],
    recentTransactions: [
      {
        id: "t1",
        type: "expense",
        amount: 10_000,
        occurredOn: "2026-10-20",
        note: "خرید",
        accountName: "نقدی",
        categoryName: null,
      },
    ],
    hasAccounts: true,
    hasTransactions: true,
  };

  const overview = mapMobileOverview(response);

  assert.equal(overview.summary.balance, 750_000);
  assert.equal(overview.summary.income, 100_000);
  assert.equal(overview.summary.expense, 40_000);
  assert.equal(overview.summary.net, 60_000);
  assert.equal(overview.summary.rangeLabel, "مهر ۱۴۰۵");
  assert.equal(overview.accounts[1]?.kindLabel, "بانکی");
  assert.equal(overview.categoryBreakdown[0]?.percent, 75);
  assert.equal(overview.categoryBreakdown[1]?.name, "بدون دسته‌بندی");
  assert.equal(
    overview.recentTransactions[0]?.categoryName,
    "بدون دسته‌بندی",
  );
});
