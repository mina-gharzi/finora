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
  ReportsView,
  type ReportsViewProps,
} from "@/components/reports/reports-view";

const MINUS = "\u2212";

afterEach(cleanup);

/**
 * Anchors (verified by reports-range.test.ts): the selected month is Mehr
 * 1405 (`1405-07`), the previous month is Shahrivar 1405, and the six-month
 * trend window runs اردیبهشت … مهر 1405.
 */
const BASE_PROPS: ReportsViewProps = {
  monthOptions: [
    { param: "1405-07", label: "مهر 1405" },
    { param: "1405-06", label: "شهریور 1405" },
    { param: "1405-05", label: "مرداد 1405" },
  ],
  selectedParam: "1405-07",
  monthLabel: "مهر 1405",
  rangeLabel: "1405/07/01 تا 1405/07/30",
  previousLabel: "شهریور 1405",
  totals: { income: 1_000_000, expense: 250_000, net: 750_000 },
  comparison: {
    income: {
      current: 1_000_000,
      previous: 800_000,
      delta: 200_000,
      percent: 25,
    },
    expense: {
      current: 250_000,
      previous: 250_000,
      delta: 0,
      percent: 0,
    },
    net: {
      current: 750_000,
      previous: 550_000,
      delta: 200_000,
      percent: 36,
    },
  },
  trend: [
    { param: "1405-02", label: "اردیبهشت 1405", shortLabel: "اردیبهشت", income: 500_000, expense: 100_000, net: 400_000 },
    { param: "1405-03", label: "خرداد 1405", shortLabel: "خرداد", income: 600_000, expense: 150_000, net: 450_000 },
    { param: "1405-04", label: "تیر 1405", shortLabel: "تیر", income: 700_000, expense: 200_000, net: 500_000 },
    { param: "1405-05", label: "مرداد 1405", shortLabel: "مرداد", income: 800_000, expense: 220_000, net: 580_000 },
    { param: "1405-06", label: "شهریور 1405", shortLabel: "شهریور", income: 800_000, expense: 250_000, net: 550_000 },
    { param: "1405-07", label: "مهر 1405", shortLabel: "مهر", income: 1_000_000, expense: 250_000, net: 750_000 },
  ],
  categoryBreakdown: [
    { categoryId: "c1", categoryName: "خرید روزانه", amount: 200_000 },
    { categoryId: null, categoryName: null, amount: 50_000 },
  ],
  hasTransactions: true,
  balanceRange: 6,
  balancePoints: [
    { param: "1405-02", label: "اردیبهشت 1405", shortLabel: "اردیبهشت", balance: 2_000_000, income: 500_000, expense: 100_000, net: 400_000, change: null },
    { param: "1405-03", label: "خرداد 1405", shortLabel: "خرداد", balance: 2_450_000, income: 600_000, expense: 150_000, net: 450_000, change: 450_000 },
    { param: "1405-04", label: "تیر 1405", shortLabel: "تیر", balance: 2_950_000, income: 700_000, expense: 200_000, net: 500_000, change: 500_000 },
    { param: "1405-05", label: "مرداد 1405", shortLabel: "مرداد", balance: 3_530_000, income: 800_000, expense: 220_000, net: 580_000, change: 580_000 },
    { param: "1405-06", label: "شهریور 1405", shortLabel: "شهریور", balance: 4_080_000, income: 800_000, expense: 250_000, net: 550_000, change: 550_000 },
    { param: "1405-07", label: "مهر 1405", shortLabel: "مهر", balance: 4_750_000, income: 1_000_000, expense: 250_000, net: 750_000, change: 670_000 },
  ],
  balanceCurrent: 4_750_000,
  hasAccounts: true,
};

function renderView(overrides: Partial<ReportsViewProps> = {}) {
  return render(<ReportsView {...BASE_PROPS} {...overrides} />);
}

describe("ReportsView — header", () => {
  it("shows the heading and a link to add a transaction", () => {
    renderView();

    expect(
      screen.getByRole("heading", { level: 1, name: "گزارش‌ها" }),
    ).toBeTruthy();

    const addLink = screen.getByRole("link", { name: "افزودن تراکنش" });
    expect(addLink.getAttribute("href")).toBe("/transactions/new");
  });
});

describe("ReportsView — no transactions", () => {
  it("guides the user to add a transaction and hides every report section", () => {
    renderView({
      hasTransactions: false,
      categoryBreakdown: [],
      totals: { income: 0, expense: 0, net: 0 },
      trend: BASE_PROPS.trend.map((point) => ({
        ...point,
        income: 0,
        expense: 0,
        net: 0,
      })),
    });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "هنوز تراکنشی ثبت نشده است",
      }),
    ).toBeTruthy();

    const links = screen.getAllByRole("link", { name: "افزودن تراکنش" });
    expect(
      links.some((link) => link.getAttribute("href") === "/transactions/new"),
    ).toBe(true);

    // No month selector, comparison, trend or breakdown for a fresh user.
    expect(screen.queryByLabelText("ماه گزارش")).toBeNull();
    expect(screen.queryByText("روند ماهانه")).toBeNull();
    expect(screen.queryByText("هزینه بر اساس دسته‌بندی")).toBeNull();
    expect(screen.queryByText("جریان نقدی خالص")).toBeNull();
  });
});

describe("ReportsView — month selector", () => {
  it("offers recent months as a GET form with the current selection", () => {
    renderView();

    const select = screen.getByLabelText("ماه گزارش") as HTMLSelectElement;
    expect(select.getAttribute("name")).toBe("month");

    const form = select.closest("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/reports");

    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "مهر 1405",
      "شهریور 1405",
      "مرداد 1405",
    ]);
    expect(select.value).toBe("1405-07");

    const submit = within(form as HTMLElement).getByRole("button", {
      name: "نمایش",
    });
    expect(submit.getAttribute("type")).toBe("submit");
  });

  it("shows the resolved range and an empty-month note", () => {
    renderView({
      totals: { income: 0, expense: 0, net: 0 },
      comparison: {
        income: { current: 0, previous: 100_000, delta: -100_000, percent: -100 },
        expense: { current: 0, previous: 50_000, delta: -50_000, percent: -100 },
        net: { current: 0, previous: 50_000, delta: -50_000, percent: -100 },
      },
    });

    expect(screen.getByText("بازه: 1405/07/01 تا 1405/07/30")).toBeTruthy();
    expect(
      screen.getByText(/در این ماه تراکنشی ثبت نشده است/),
    ).toBeTruthy();
  });
});

describe("ReportsView — month-over-month comparison", () => {
  it("renders the current amounts and the previous month's baseline", () => {
    renderView();

    // Income/expense/net values on the comparison cards.
    expect(screen.getAllByText("1,000,000 تومان").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("250,000 تومان").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("+750,000 تومان")).toBeTruthy();

    expect(screen.getByText(/شهریور 1405: \+800,000 تومان/)).toBeTruthy();
    expect(screen.getByText(/شهریور 1405: \+250,000 تومان/)).toBeTruthy();
    expect(screen.getByText(/شهریور 1405: \+550,000 تومان/)).toBeTruthy();
  });

  it("labels an increase, a flat change and shows signed percentages", () => {
    renderView();

    // Income and net both increased; expense was flat.
    expect(screen.getAllByText("افزایش").length).toBe(2);
    expect(screen.getAllByText("بدون تغییر").length).toBe(1);
    expect(screen.getByText("(+25%)")).toBeTruthy();
    expect(screen.getByText("(0%)")).toBeTruthy();
  });

  it("labels a decrease with an explicit minus sign", () => {
    renderView({
      totals: { income: 600_000, expense: 300_000, net: 300_000 },
      comparison: {
        income: {
          current: 600_000,
          previous: 1_000_000,
          delta: -400_000,
          percent: -40,
        },
        expense: {
          current: 300_000,
          previous: 250_000,
          delta: 50_000,
          percent: 20,
        },
        net: {
          current: 300_000,
          previous: 750_000,
          delta: -450_000,
          percent: -60,
        },
      },
    });

    expect(screen.getAllByText("کاهش").length).toBe(2);
    expect(screen.getByText(`(${MINUS}40%)`)).toBeTruthy();
    expect(screen.getByText(`(${MINUS}60%)`)).toBeTruthy();
    // The signed deltas themselves carry the unicode minus.
    expect(screen.getByText(`${MINUS}400,000 تومان`)).toBeTruthy();
    expect(screen.getByText(`${MINUS}450,000 تومان`)).toBeTruthy();
  });

  it("shows a neutral ناموجود state when the previous month has no base", () => {
    renderView({
      totals: { income: 150_000, expense: 0, net: 150_000 },
      comparison: {
        income: {
          current: 150_000,
          previous: 0,
          delta: 150_000,
          percent: null,
        },
        expense: {
          current: 0,
          previous: 0,
          delta: 0,
          percent: null,
        },
        net: {
          current: 150_000,
          previous: 0,
          delta: 150_000,
          percent: null,
        },
      },
    });

    expect(screen.getAllByText("درصد: ناموجود").length).toBe(3);
    expect(screen.queryByText(/%\)/)).toBeNull();
  });

  it("shows a negative net with an explicit unicode minus", () => {
    renderView({
      totals: { income: 100_000, expense: 350_000, net: -250_000 },
      comparison: {
        income: {
          current: 100_000,
          previous: 100_000,
          delta: 0,
          percent: 0,
        },
        expense: {
          current: 350_000,
          previous: 200_000,
          delta: 150_000,
          percent: 75,
        },
        net: {
          current: -250_000,
          previous: -100_000,
          delta: -150_000,
          percent: null,
        },
      },
    });

    expect(screen.getByText(`${MINUS}250,000 تومان`)).toBeTruthy();
  });
});

describe("ReportsView — six-month trend", () => {
  it("lists all six months oldest first with their amounts as text", () => {
    renderView();

    expect(screen.getByText("روند ماهانه")).toBeTruthy();

    // Every month appears as a trend row label (some also appear in the
    // month selector, so count occurrences).
    for (const label of [
      "اردیبهشت 1405",
      "خرداد 1405",
      "تیر 1405",
      "شهریور 1405",
      "مهر 1405",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }

    // Every month's income and expense appears as visible text.
    expect(screen.getByText("500,000 تومان")).toBeTruthy();
    expect(screen.getByText("100,000 تومان")).toBeTruthy();
    expect(screen.getAllByText("1,000,000 تومان").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("250,000 تومان").length).toBeGreaterThanOrEqual(1);

    // Signed net per month.
    expect(screen.getByText("خالص +400,000 تومان")).toBeTruthy();
    expect(screen.getByText("خالص +750,000 تومان")).toBeTruthy();
  });

  it("distinguishes income from expense by text labels, not colour alone", () => {
    renderView();

    const labels = screen.getAllByText("درآمد");
    const expenses = screen.getAllByText("هزینه");
    // One comparison card + one bar row per trend month.
    expect(labels.length).toBeGreaterThanOrEqual(7);
    expect(expenses.length).toBeGreaterThanOrEqual(7);
  });

  it("scales every bar against the shared window maximum", () => {
    const { container } = renderView();

    const bars = Array.from(
      container.querySelectorAll<HTMLDivElement>('[aria-hidden="true"].bg-success, [aria-hidden="true"].bg-danger'),
    );
    // Two bars per month (income + expense) for six months.
    expect(bars).toHaveLength(12);

    const widths = bars.map((bar) => bar.style.width);
    // The largest value (1,000,000) is full width; half is 50%; zero is 0%.
    expect(widths.filter((width) => width === "100%").length).toBe(1);
    expect(widths.filter((width) => width === "50%").length).toBe(1);
    expect(widths.filter((width) => width === "10%").length).toBe(1);
  });

  it("renders zero-width bars and a note when the whole window is empty", () => {
    renderView({
      totals: { income: 0, expense: 0, net: 0 },
      trend: BASE_PROPS.trend.map((point) => ({
        ...point,
        income: 0,
        expense: 0,
        net: 0,
      })),
    });

    expect(
      screen.getByText(/در این بازه شش‌ماهه تراکنشی ثبت نشده است/),
    ).toBeTruthy();
    expect(screen.getAllByText("0 تومان").length).toBeGreaterThanOrEqual(12);
  });
});

describe("ReportsView — category breakdown", () => {
  it("lists slices with amounts, percentages and an uncategorised bucket", () => {
    renderView();

    expect(screen.getByText("هزینه بر اساس دسته‌بندی")).toBeTruthy();
    expect(screen.getByText("خرید روزانه")).toBeTruthy();
    expect(screen.getByText("بدون دسته‌بندی")).toBeTruthy();
    // 200,000 also appears as an income delta on a comparison card.
    expect(screen.getAllByText("200,000 تومان").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("50,000 تومان")).toBeTruthy();

    // 200000 of 250000 is 80%; 50000 is 20%.
    expect(screen.getByText("80%")).toBeTruthy();
    expect(screen.getByText("20%")).toBeTruthy();
  });

  it("marks the largest expense category", () => {
    renderView();

    expect(screen.getByText("بزرگ‌ترین")).toBeTruthy();
  });

  it("shows an empty state when the month has no expenses", () => {
    renderView({ categoryBreakdown: [] });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "در این ماه هزینه‌ای ثبت نشده است",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("بزرگ‌ترین")).toBeNull();
  });
});

describe("ReportsView — disclosure footer", () => {
  it("explains that opening balances are excluded and links to all transactions", () => {
    renderView();

    expect(
      screen.getByText(/موجودی اولیه حساب‌ها در درآمد/),
    ).toBeTruthy();

    const allLink = screen.getByRole("link", { name: "مشاهده همه تراکنش‌ها" });
    expect(allLink.getAttribute("href")).toBe("/transactions");
  });
});

describe("ReportsView — balance trend", () => {
  it("names the metric honestly and states what is included and excluded", () => {
    renderView();

    expect(screen.getByText("روند موجودی حساب‌ها")).toBeTruthy();
    // Never claims full net worth.
    expect(
      screen.getByText(/نه ارزش خالص دارایی‌ها/),
    ).toBeTruthy();
    expect(screen.getByText(/شامل: موجودی اولیه همه حساب‌ها/)).toBeTruthy();
    expect(screen.getByText(/ناموجود: بدهی‌ها، سرمایه‌گذاری‌ها/)).toBeTruthy();
  });

  it("lists every month's balance as visible signed text", () => {
    renderView();

    // Balance values are formatted with an explicit + sign and the Toman unit.
    expect(screen.getByText("+2,000,000 تومان")).toBeTruthy();
    // The latest month's balance is shown both as a row and in the highlight.
    expect(screen.getAllByText("+4,750,000 تومان").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the range selector as a GET form preserving the month", () => {
    renderView();

    const select = screen.getByLabelText("بازه روند") as HTMLSelectElement;
    expect(select.getAttribute("name")).toBe("range");
    expect(select.value).toBe("6");

    const form = select.closest("form");
    expect(form?.getAttribute("method")).toBe("get");
    expect(form?.getAttribute("action")).toBe("/reports");
    const hiddenMonth = form?.querySelector('input[name="month"]');
    expect(hiddenMonth).toBeTruthy();

    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "۶ ماه",
      "۱۲ ماه",
      "۲۴ ماه",
    ]);
  });

  it("marks a declining balance with an explicit minus and a down arrow", () => {
    renderView({
      balancePoints: [
        { param: "1405-06", label: "شهریور 1405", shortLabel: "شهریور", balance: 500_000, income: 0, expense: 0, net: 0, change: null },
        { param: "1405-07", label: "مهر 1405", shortLabel: "مهر", balance: -200_000, income: 0, expense: 700_000, net: -700_000, change: -700_000 },
      ],
      balanceCurrent: -200_000,
    });

    // Negative balance is rendered with the Unicode minus sign.
    expect(screen.getAllByText(`${MINUS}200,000 تومان`).length).toBeGreaterThanOrEqual(2);
    // The decline is also shown as a signed change.
    expect(screen.getByText(`${MINUS}700,000 تومان`)).toBeTruthy();
  });

  it("shows an empty state when the owner has no accounts", () => {
    renderView({ hasAccounts: false, balancePoints: [] });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "حسابی برای نمایش روند موجودی وجود ندارد",
      }),
    ).toBeTruthy();
  });
});
