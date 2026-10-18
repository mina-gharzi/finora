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
  updateTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
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

import { EditTransactionView } from "@/components/transactions/edit-transaction-view";
import { DeleteTransactionButton } from "@/components/transactions/delete-transaction-button";
import type { TransactionFormInitialValues } from "@/components/transactions/transaction-form";

const ACCOUNTS = [
  { id: "acc-1", name: "بانک ملی" },
  { id: "acc-2", name: "کیف پول" },
];

const CATEGORIES = [
  { id: "cat-1", name: "حقوق", kind: "income" as const },
  { id: "cat-2", name: "خرید روزانه", kind: "expense" as const },
];

const INITIAL: TransactionFormInitialValues = {
  type: "income",
  amountText: "5000000",
  occurredOn: "2026-10-18",
  accountId: "acc-1",
  categoryId: "cat-1",
  note: "حقوق مهر",
};

function renderEdit(overrides: Partial<Parameters<typeof EditTransactionView>[0]> = {}) {
  return render(
    <EditTransactionView
      transactionId="t-1"
      accounts={ACCOUNTS}
      categories={CATEGORIES}
      initialValues={INITIAL}
      returnHref="/transactions?type=income"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  h.state = { status: "idle" };
  h.pending = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EditTransactionView — prepopulation", () => {
  it("prefills every field from the existing transaction", () => {
    renderEdit();

    expect(
      screen.getByRole("heading", { level: 1, name: "ویرایش تراکنش" }),
    ).toBeTruthy();
    expect((screen.getByLabelText(/نوع تراکنش/) as HTMLSelectElement).value).toBe(
      "income",
    );
    expect((screen.getByLabelText(/مبلغ/) as HTMLInputElement).value).toBe(
      "5000000",
    );
    expect((screen.getByLabelText(/تاریخ/) as HTMLInputElement).value).toBe(
      "2026-10-18",
    );
    expect((screen.getByLabelText(/حساب/) as HTMLSelectElement).value).toBe(
      "acc-1",
    );
    expect(
      (screen.getByLabelText(/دسته‌بندی/) as HTMLSelectElement).value,
    ).toBe("cat-1");
    expect((screen.getByLabelText(/توضیحات/) as HTMLInputElement).value).toBe(
      "حقوق مهر",
    );
  });

  it("labels the submit button for saving edits", () => {
    renderEdit();

    expect(screen.getByRole("button", { name: "ذخیره تغییرات" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ثبت تراکنش" })).toBeNull();
  });

  it("links back to the filtered history list", () => {
    renderEdit();

    const back = screen.getByRole("link", { name: "بازگشت به تراکنش‌ها" });
    expect(back.getAttribute("href")).toBe("/transactions?type=income");
  });

  it("renders a guarded delete control", () => {
    renderEdit();

    expect(screen.getByRole("button", { name: "حذف تراکنش" })).toBeTruthy();
  });
});

describe("EditTransactionView — category filtering", () => {
  it("offers only categories compatible with the current type", () => {
    renderEdit();

    expect(screen.getByRole("option", { name: "حقوق" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "خرید روزانه" })).toBeNull();

    fireEvent.change(screen.getByLabelText(/نوع تراکنش/), {
      target: { value: "expense" },
    });

    expect(screen.getByRole("option", { name: "خرید روزانه" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "حقوق" })).toBeNull();
  });
});

describe("EditTransactionView — feedback", () => {
  it("shows field-level validation feedback returned by the action", () => {
    h.state = {
      status: "error",
      message: "ویرایش تراکنش انجام نشد.",
      fieldErrors: { amount: "مبلغ باید بیشتر از صفر باشد." },
    };

    renderEdit();

    expect(screen.getAllByText("مبلغ باید بیشتر از صفر باشد.").length).toBe(1);
    expect(screen.getAllByText("ویرایش تراکنش انجام نشد.").length).toBeGreaterThan(
      0,
    );
  });
});

describe("DeleteTransactionButton", () => {
  it("requires an explicit confirmation before submitting", () => {
    render(<DeleteTransactionButton transactionId="t-1" returnTo="/transactions" />);

    expect(screen.queryByRole("button", { name: "تأیید حذف" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "حذف تراکنش" }));

    expect(screen.getByRole("button", { name: "تأیید حذف" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "انصراف" })).toBeTruthy();

    expect(
      document.querySelector<HTMLInputElement>('input[name="transactionId"]')
        ?.value,
    ).toBe("t-1");
    expect(
      document.querySelector<HTMLInputElement>('input[name="returnTo"]')?.value,
    ).toBe("/transactions");
  });

  it("lets the user back out of the confirmation step", () => {
    render(<DeleteTransactionButton transactionId="t-1" returnTo="/transactions" />);

    fireEvent.click(screen.getByRole("button", { name: "حذف تراکنش" }));
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));

    expect(screen.queryByRole("button", { name: "تأیید حذف" })).toBeNull();
    expect(screen.getByRole("button", { name: "حذف تراکنش" })).toBeTruthy();
  });

  it("disables the controls while a deletion is pending", () => {
    h.pending = true;

    render(<DeleteTransactionButton transactionId="t-1" returnTo="/transactions" />);
    fireEvent.click(screen.getByRole("button", { name: "حذف تراکنش" }));

    const confirm = screen.getByRole("button", {
      name: "تأیید حذف",
    }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", {
      name: "انصراف",
    }) as HTMLButtonElement;

    expect(confirm.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });

  it("surfaces a failure message from the action", () => {
    h.state = { status: "error", message: "تراکنش موردنظر یافت نشد." };

    render(<DeleteTransactionButton transactionId="t-1" returnTo="/transactions" />);

    expect(screen.getByText("تراکنش موردنظر یافت نشد.")).toBeTruthy();
  });
});
