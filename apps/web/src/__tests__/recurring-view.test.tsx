/**
 * @vitest-environment jsdom
 */
import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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

vi.mock("@/app/actions/recurring", () => ({
  createRecurringAction: vi.fn(),
  toggleRecurringActiveAction: vi.fn(),
  deleteRecurringAction: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [{ status: "idle" }, () => {}, false],
  };
});

import { RecurringView } from "@/components/recurring/recurring-view";
import type { RecurringListItem } from "@/lib/finance/recurring";

const RULE_ID = "55555555-5555-4555-8555-555555555555";

function rule(overrides: Partial<RecurringListItem> = {}): RecurringListItem {
  return {
    id: RULE_ID,
    accountId: "33333333-3333-4333-8333-333333333333",
    accountName: "بانک ملی",
    categoryId: "44444444-4444-4444-8444-444444444444",
    categoryName: "خرید",
    type: "expense",
    amount: 150000,
    note: "اجاره ماهانه",
    frequency: "monthly",
    dayOfMonth: 15,
    weekday: null,
    startOn: "2026-10-07",
    endOn: null,
    generatedThrough: null,
    active: true,
    ...overrides,
  };
}

afterEach(cleanup);

describe("RecurringView", () => {
  it("renders the empty state with a link to create a rule", () => {
    render(<RecurringView rules={[]} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "تراکنش‌های تکرارشونده",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "هنوز قانون تکرارشونده‌ای ندارید",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "ساخت قانون" })
        .getAttribute("href"),
    ).toBe("/transactions/recurring/new");
  });

  it("renders a monthly active rule with its schedule, status and open end", () => {
    render(<RecurringView rules={[rule()]} />);

    expect(screen.getByText("هر ماه، روز 15 (تقویم شمسی)")).toBeTruthy();
    expect(screen.getByText("150,000 تومان")).toBeTruthy();
    expect(screen.getByText("بانک ملی")).toBeTruthy();
    expect(screen.getByText("خرید")).toBeTruthy();
    expect(screen.getByText("فعال")).toBeTruthy();
    expect(screen.getByText("بدون پایان")).toBeTruthy();
    expect(screen.getByText("اجاره ماهانه")).toBeTruthy();
  });

  it("renders a weekly paused rule with its weekday and end date", () => {
    render(
      <RecurringView
        rules={[
          rule({
            frequency: "weekly",
            dayOfMonth: null,
            weekday: 6,
            active: false,
            categoryId: null,
            categoryName: null,
            endOn: "2026-12-31",
          }),
        ]}
      />,
    );

    expect(screen.getByText("هر هفته، شنبه")).toBeTruthy();
    expect(screen.getByText("متوقف")).toBeTruthy();
    expect(screen.getByText("بدون دسته‌بندی")).toBeTruthy();
    expect(screen.queryByText("بدون پایان")).toBeNull();
    expect(
      screen.getByRole("button", { name: "فعال‌سازی قانون تکرارشونده" }),
    ).toBeTruthy();
  });
});
