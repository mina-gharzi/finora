/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/accounts", () => ({
  createAccountAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  setAccountArchivedAction: vi.fn(),
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
import { ArchiveAccountButton } from "@/components/accounts/archive-account-button";
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
    render(<AccountsView accounts={[]} balanceById={{}} />);

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

  it("renders accounts with type badges, current and opening balances", () => {
    const accounts: AccountRow[] = [
      accountRow({ id: "a1", name: "کیف پول نقدی", type: "cash", openingBalance: 150000 }),
      accountRow({ id: "a2", name: "بانک ملی", type: "bank", openingBalance: 0 }),
    ];

    render(
      <AccountsView accounts={accounts} balanceById={{ a1: 200000, a2: 0 }} />,
    );

    expect(screen.getByText("کیف پول نقدی")).toBeTruthy();
    expect(screen.getByText("بانک ملی")).toBeTruthy();
    expect(screen.getAllByText("نقدی").length).toBeGreaterThan(0);
    expect(screen.getAllByText("بانکی").length).toBeGreaterThan(0);
    // Current balance uses the computed map, opening balance the row value.
    expect(screen.getByText(/موجودی فعلی: 200,000 تومان/)).toBeTruthy();
    expect(screen.getByText(/موجودی اولیه: 150,000 تومان/)).toBeTruthy();
  });

  it("badges archived accounts and lists the active ones first", () => {
    const accounts: AccountRow[] = [
      accountRow({ id: "old", name: "حساب بایگانی", archived: true, createdAt: new Date(2020, 0, 1) }),
      accountRow({ id: "new", name: "حساب فعال", archived: false, createdAt: new Date(2024, 0, 1) }),
    ];

    render(<AccountsView accounts={accounts} balanceById={{}} />);

    expect(screen.getAllByText("بایگانی‌شده")).toHaveLength(1);

    const names = screen
      .getAllByText(/حساب (فعال|بایگانی)/)
      .map((node) => node.textContent);
    expect(names[0]).toBe("حساب فعال");
  });

  it("offers archive and delete controls for every account", () => {
    const accounts: AccountRow[] = [
      accountRow({ id: "a1", name: "کیف پول نقدی" }),
    ];

    render(<AccountsView accounts={accounts} balanceById={{}} />);

    expect(
      screen.getByRole("button", { name: "بایگانی حساب کیف پول نقدی" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "حذف حساب کیف پول نقدی" }),
    ).toBeTruthy();
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

describe("ArchiveAccountButton", () => {
  it("requires confirmation and sends archived=true for an active account", () => {
    const { container } = render(
      <ArchiveAccountButton accountId="acc-1" accountName="کیف پول نقدی" archived={false} />,
    );

    expect(
      screen.queryByRole("button", { name: "تأیید بایگانی" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "بایگانی حساب کیف پول نقدی" }),
    );

    expect(screen.getByRole("button", { name: "تأیید بایگانی" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "انصراف" })).toBeTruthy();

    const id = container.querySelector<HTMLInputElement>('input[name="accountId"]');
    const archived = container.querySelector<HTMLInputElement>(
      'input[name="archived"]',
    );
    expect(id?.value).toBe("acc-1");
    expect(archived?.value).toBe("true");
  });

  it("lets the user back out of the archive confirmation", () => {
    render(
      <ArchiveAccountButton accountId="acc-1" accountName="کیف پول نقدی" archived={false} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "بایگانی حساب کیف پول نقدی" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));

    expect(screen.queryByRole("button", { name: "تأیید بایگانی" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "بایگانی حساب کیف پول نقدی" }),
    ).toBeTruthy();
  });

  it("unarchives in one step with archived=false and no confirmation", () => {
    const { container } = render(
      <ArchiveAccountButton accountId="acc-1" accountName="کیف پول نقدی" archived />,
    );

    expect(screen.queryByRole("button", { name: "انصراف" })).toBeNull();

    const button = screen.getByRole("button", {
      name: "خروج از بایگانی حساب کیف پول نقدی",
    });
    expect(button).toBeTruthy();

    const archived = container.querySelector<HTMLInputElement>(
      'input[name="archived"]',
    );
    expect(archived?.value).toBe("false");
  });
});
