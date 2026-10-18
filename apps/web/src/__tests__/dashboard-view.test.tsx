/**
 * @vitest-environment jsdom
 */
import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  DashboardView,
  type DashboardViewProps,
} from "@/components/dashboard/dashboard-view";

const MINUS = "\u2212";

afterEach(cleanup);

const BASE_PROPS: DashboardViewProps = {
  period: "this-month",
  rangeLabel: "مهر 1405",
  totals: { income: 1_000_000, expense: 250_000, net: 750_000 },
  categoryBreakdown: [
    { categoryId: "c1", categoryName: "خرید روزانه", amount: 200_000 },
    { categoryId: null, categoryName: null, amount: 50_000 },
  ],
  accountBalances: [
    { id: "acc-1", name: "نقدی خانه", type: "cash", archived: false, balance: 880_000 },
    { id: "acc-2", name: "پس‌انداز بانک", type: "bank", archived: false, balance: 0 },
  ],
  recentTransactions: [
    {
      id: "t1",
      type: "income",
      amount: 5_000_000,
      occurredOn: "2026-10-18",
      note: "حقوق مهر",
      accountId: "acc-1",
      accountName: "بانک ملی",
      categoryName: "حقوق",
    },
    {
      id: "t2",
      type: "expense",
      amount: 120_000,
      occurredOn: "2026-10-19",
      note: "",
      accountId: "acc-2",
      accountName: "کارت هدیه",
      categoryName: "حمل و نقل",
    },
  ],
  hasAccounts: true,
  hasTransactions: true,
};

function renderView(overrides: Partial<DashboardViewProps> = {}) {
  return render(<DashboardView {...BASE_PROPS} {...overrides} />);
}

describe("DashboardView — header", () => {
  it("shows the heading and a link to add a transaction", () => {
    renderView();

    expect(
      screen.getByRole("heading", { level: 1, name: "داشبورد" }),
    ).toBeTruthy();

    const addLink = screen.getByRole("link", { name: "افزودن تراکنش" });
    expect(addLink.getAttribute("href")).toBe("/transactions/new");
  });
});

describe("DashboardView — no accounts", () => {
  it("guides the user to create an account and hides period metrics", () => {
    renderView({ hasAccounts: false, accountBalances: [], hasTransactions: false });

    expect(
      screen.getByRole("heading", { level: 2, name: "برای شروع یک حساب بسازید" }),
    ).toBeTruthy();

    const link = screen.getByRole("link", { name: "افزودن حساب" });
    expect(link.getAttribute("href")).toBe("/accounts");

    // No period selector or zeroed metrics when a balance cannot be known.
    expect(screen.queryByRole("navigation", { name: "انتخاب بازه زمانی" })).toBeNull();
    expect(screen.queryByText("جریان نقدی خالص")).toBeNull();
  });
});

describe("DashboardView — period selector", () => {
  it("offers this month, previous month and all time with the active one marked", () => {
    renderView({ period: "prev-month" });

    const nav = screen.getByRole("navigation", {
      name: "انتخاب بازه زمانی",
    });

    expect(within(nav).getByRole("link", { name: "این ماه" }).getAttribute("href")).toBe(
      "/?period=this-month",
    );
    expect(
      within(nav).getByRole("link", { name: "ماه گذشته" }).getAttribute("href"),
    ).toBe("/?period=prev-month");
    expect(
      within(nav).getByRole("link", { name: "همه زمان‌ها" }).getAttribute("href"),
    ).toBe("/?period=all-time");

    expect(
      within(nav).getByRole("link", { name: "ماه گذشته" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav).getByRole("link", { name: "این ماه" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("shows the resolved span label", () => {
    renderView({ rangeLabel: "شهریور 1405" });
    expect(screen.getByText("بازه: شهریور 1405")).toBeTruthy();
  });
});

describe("DashboardView — summary metrics", () => {
  it("renders income, expense and net cash flow as distinguished values", () => {
    renderView();

    expect(screen.getByText("جریان نقدی خالص")).toBeTruthy();
    expect(screen.getByText("1,000,000 تومان")).toBeTruthy();
    expect(screen.getByText("250,000 تومان")).toBeTruthy();
    expect(screen.getByText("+750,000 تومان")).toBeTruthy();

    // Income/expense are identifiable by text, not colour alone.
    expect(screen.getAllByText("درآمد").length).toBeGreaterThan(0);
    expect(screen.getAllByText("هزینه").length).toBeGreaterThan(0);
  });

  it("labels a surplus net as مازاد", () => {
    renderView({ totals: { income: 100, expense: 0, net: 100 } });
    expect(screen.getByText("مازاد")).toBeTruthy();
  });

  it("labels a deficit net as کسری with an explicit minus sign", () => {
    renderView({ totals: { income: 100_000, expense: 350_000, net: -250_000 } });

    expect(screen.getByText("کسری")).toBeTruthy();
    expect(screen.getByText(`${MINUS}250,000 تومان`)).toBeTruthy();
  });

  it("labels a balanced net as بدون تغییر", () => {
    renderView({ totals: { income: 500_000, expense: 500_000, net: 0 } });
    expect(screen.getByText("بدون تغییر")).toBeTruthy();
  });
});

describe("DashboardView — account balances", () => {
  it("lists current balances and labels them as full-history", () => {
    renderView();

    expect(screen.getByText("نقدی خانه")).toBeTruthy();
    expect(screen.getByText("پس‌انداز بانک")).toBeTruthy();
    expect(screen.getByText("+880,000 تومان")).toBeTruthy();
    expect(screen.getByText("0 تومان")).toBeTruthy();

    expect(
      screen.getByText(/مستقل از بازه\s+زمانی انتخاب‌شده/),
    ).toBeTruthy();

    const manage = screen.getByRole("link", { name: "مدیریت حساب‌ها" });
    expect(manage.getAttribute("href")).toBe("/accounts");
  });
});

describe("DashboardView — category breakdown", () => {
  it("lists expense slices with amounts, percentages and an uncategorised bucket", () => {
    renderView();

    expect(screen.getByText("خرید روزانه")).toBeTruthy();
    expect(screen.getByText("بدون دسته‌بندی")).toBeTruthy();
    expect(screen.getByText("200,000 تومان")).toBeTruthy();
    expect(screen.getByText("50,000 تومان")).toBeTruthy();

    // 200000 of 250000 is 80%; 50000 is 20%.
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
  });

  it("shows an empty state when there are no expenses in the period", () => {
    renderView({ categoryBreakdown: [] });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "در این بازه هزینه‌ای ثبت نشده است",
      }),
    ).toBeTruthy();
  });
});

describe("DashboardView — recent transactions", () => {
  it("lists transactions with a signed amount and a Jalali date", () => {
    renderView();

    expect(screen.getByText("5,000,000 تومان", { exact: false })).toBeTruthy();
    expect(screen.getByText(`${MINUS}120,000 تومان`)).toBeTruthy();

    // 2026-10-18 is 1405/07/26, 2026-10-19 is 1405/07/27.
    expect(screen.getByText(/1405\/07\/26/)).toBeTruthy();
    expect(screen.getByText(/1405\/07\/27/)).toBeTruthy();

    expect(screen.getAllByText(/حقوق/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/حمل و نقل/).length).toBeGreaterThan(0);
  });

  it("links each row to the transaction and offers a full-history link", () => {
    renderView();

    const rowLink = screen.getByRole("link", {
      name: "جزئیات تراکنش بانک ملی",
    });
    expect(rowLink.getAttribute("href")).toBe("/transactions/t1/edit");

    const allLink = screen.getByRole("link", { name: "مشاهده همه تراکنش‌ها" });
    expect(allLink.getAttribute("href")).toBe("/transactions");
  });

  it("invites onboarding when the user has never recorded a transaction", () => {
    renderView({
      recentTransactions: [],
      categoryBreakdown: [],
      totals: { income: 0, expense: 0, net: 0 },
      hasTransactions: false,
    });

    expect(
      screen.getByRole("heading", { level: 2, name: "هنوز تراکنشی ثبت نشده است" }),
    ).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "افزودن تراکنش" });
    expect(links.some((link) => link.getAttribute("href") === "/transactions/new")).toBe(true);
  });

  it("explains an empty period and offers to view all time", () => {
    renderView({ recentTransactions: [] });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "در این بازه تراکنشی ثبت نشده است",
      }),
    ).toBeTruthy();

    const link = screen.getByRole("link", { name: "نمایش همه تراکنش‌ها" });
    expect(link.getAttribute("href")).toBe("/?period=all-time");
  });
});
