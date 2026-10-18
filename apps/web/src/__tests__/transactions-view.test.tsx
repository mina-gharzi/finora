/**
 * @vitest-environment jsdom
 */
import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: { status: "idle" } as Record<string, unknown>,
  pending: false,
}));

vi.mock("@/app/actions/transactions", () => ({
  createTransactionAction: vi.fn(),
}));

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

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [h.state, () => {}, h.pending],
  };
});

import { TransactionsView } from "@/components/transactions/transactions-view";

const ACCOUNTS = [
  { id: "acc-1", name: "کیف پول نقدی" },
  { id: "acc-2", name: "بانک ملی" },
];
const CATEGORIES = [
  { id: "cat-1", name: "حقوق", kind: "income" as const },
  { id: "cat-2", name: "خرید روزانه", kind: "expense" as const },
];

beforeEach(() => {
  h.state = { status: "idle" };
  h.pending = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TransactionsView", () => {
  it("prompts the user to create an account when none exist", () => {
    render(
      <TransactionsView
        accounts={[]}
        hasAnyAccounts={false}
        categories={[]}
        defaultDate="2026-10-18"
      />,
    );

    expect(
      screen.getByText("برای ثبت تراکنش ابتدا یک حساب بسازید"),
    ).toBeTruthy();

    const link = screen.getByRole("link", { name: "افزودن حساب" });
    expect(link.getAttribute("href")).toBe("/accounts");
    expect(screen.queryByRole("button", { name: "ثبت تراکنش" })).toBeNull();
  });

  it("explains that all accounts are archived when none are active", () => {
    render(
      <TransactionsView
        accounts={[]}
        hasAnyAccounts
        categories={[]}
        defaultDate="2026-10-18"
      />,
    );

    expect(
      screen.getByText("همه حساب‌های شما بایگانی شده‌اند"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "مدیریت حساب‌ها" }).getAttribute("href"),
    ).toBe("/accounts");
    expect(screen.queryByRole("button", { name: "ثبت تراکنش" })).toBeNull();
  });

  it("renders the creation form when the user has accounts", () => {
    render(
      <TransactionsView
        accounts={ACCOUNTS}
        hasAnyAccounts
        categories={CATEGORIES}
        defaultDate="2026-10-18"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "تراکنش جدید" }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/نوع تراکنش/)).toBeTruthy();
    expect(screen.getByLabelText(/مبلغ/)).toBeTruthy();
    expect(screen.getByLabelText(/تاریخ/)).toBeTruthy();
    expect(screen.getByLabelText(/حساب/)).toBeTruthy();
    expect(screen.getByLabelText(/دسته‌بندی/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "ثبت تراکنش" })).toBeTruthy();

    const account = screen.getByLabelText(/حساب/) as HTMLSelectElement;
    expect(account.value).toBe("acc-1");

    const date = screen.getByLabelText(/تاریخ/) as HTMLInputElement;
    expect(date.value).toBe("2026-10-18");
  });

  it("offers only categories compatible with the selected transaction type", () => {
    render(
      <TransactionsView
        accounts={ACCOUNTS}
        hasAnyAccounts
        categories={CATEGORIES}
        defaultDate="2026-10-18"
      />,
    );

    // Defaults to expense.
    expect(screen.getByRole("option", { name: "خرید روزانه" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "حقوق" })).toBeNull();

    fireEvent.change(screen.getByLabelText(/نوع تراکنش/), {
      target: { value: "income" },
    });

    expect(screen.getByRole("option", { name: "حقوق" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "خرید روزانه" })).toBeNull();
  });

  it("previews the amount with the shared Toman formatter, including Persian numerals", () => {
    render(
      <TransactionsView
        accounts={ACCOUNTS}
        hasAnyAccounts
        categories={CATEGORIES}
        defaultDate="2026-10-18"
      />,
    );

    expect(screen.getByText("عدد صحیح و بدون اعشار وارد کنید.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/مبلغ/), {
      target: { value: "120000" },
    });
    expect(screen.getByText("معادل: 120,000 تومان")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/مبلغ/), {
      target: { value: "۱٬۲۰۰٬۰۰۰" },
    });
    expect(screen.getByText("معادل: 1,200,000 تومان")).toBeTruthy();
  });

  it("shows field-level validation feedback returned by the action", () => {
    h.state = {
      status: "error",
      message: "ثبت تراکنش انجام نشد.",
      fieldErrors: { amount: "مبلغ باید بیشتر از صفر باشد." },
    };

    render(
      <TransactionsView
        accounts={ACCOUNTS}
        hasAnyAccounts
        categories={CATEGORIES}
        defaultDate="2026-10-18"
      />,
    );

    expect(screen.getByText("مبلغ باید بیشتر از صفر باشد.")).toBeTruthy();
    expect(screen.getByText("ثبت تراکنش انجام نشد.")).toBeTruthy();
  });

  it("shows a success message after creation", () => {
    h.state = { status: "success", message: "تراکنش با موفقیت ثبت شد." };

    render(
      <TransactionsView
        accounts={ACCOUNTS}
        hasAnyAccounts
        categories={CATEGORIES}
        defaultDate="2026-10-18"
      />,
    );

    expect(screen.getByText("تراکنش با موفقیت ثبت شد.")).toBeTruthy();
  });

  it("disables the submit button while a submission is pending", () => {
    h.pending = true;

    render(
      <TransactionsView
        accounts={ACCOUNTS}
        hasAnyAccounts
        categories={CATEGORIES}
        defaultDate="2026-10-18"
      />,
    );

    const submit = screen.getByRole("button", {
      name: "ثبت تراکنش",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
  });
});
