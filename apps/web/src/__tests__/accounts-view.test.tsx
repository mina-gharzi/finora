/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/accounts", () => ({
  createAccountAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));

vi.mock("@finora/shared", () => ({
  formatToman: (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
  formatTomanWithUnit: (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} تومان`,
  TOMAN_UNIT: "تومان",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn((action: (...args: unknown[]) => unknown) => [
      { status: "idle" },
      (formData: FormData) => action(undefined, formData),
      false,
    ]),
  };
});

import { AccountsView } from "@/components/accounts/accounts-view";
import { DeleteAccountButton } from "@/components/accounts/delete-account-button";
import type { AccountRow } from "@/db/schema";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

function accountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: ACCOUNT_ID,
    userId: OWNER,
    name: "کیف پول نقدی",
    type: "cash",
    openingBalance: 0,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountsView", () => {
  it("renders an empty state when no accounts exist", () => {
    render(<AccountsView accounts={[]} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "حساب‌ها" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "هنوز حسابی ثبت نشده است" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "حساب‌های شما" }),
    ).toBeTruthy();
  });

  it("renders a list of accounts with type badges and formatted balances", () => {
    const accounts: AccountRow[] = [
      accountRow({ id: "a1", name: "کیف پول نقدی", type: "cash", openingBalance: 150000 }),
      accountRow({ id: "a2", name: "بانک ملی", type: "bank", openingBalance: 0 }),
    ];

    render(<AccountsView accounts={accounts} />);

    expect(screen.getByText("کیف پول نقدی")).toBeTruthy();
    expect(screen.getByText("بانک ملی")).toBeTruthy();
    expect(screen.getAllByText("نقدی").length).toBeGreaterThan(0);
    expect(screen.getAllByText("بانکی").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/150,000 تومان/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0 تومان/).length).toBeGreaterThan(0);
  });
});

describe("DeleteAccountButton", () => {
  it("requires an explicit confirmation before submitting a deletion", () => {
    render(
      <DeleteAccountButton accountId="acc-1" accountName="کیف پول نقدی" />,
    );

    expect(
      screen.queryByRole("button", { name: "تأیید حذف" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "حذف حساب کیف پول نقدی" }));

    expect(screen.getByRole("button", { name: "تأیید حذف" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "انصراف" })).toBeTruthy();

    const hidden = document.querySelector<HTMLInputElement>(
      'input[name="accountId"]',
    );
    expect(hidden?.value).toBe("acc-1");
  });

  it("lets the user back out of the confirmation step", () => {
    render(
      <DeleteAccountButton accountId="acc-1" accountName="کیف پول نقدی" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "حذف حساب کیف پول نقدی" }));
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));

    expect(screen.queryByRole("button", { name: "تأیید حذف" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "حذف حساب کیف پول نقدی" }),
    ).toBeTruthy();
  });
});
