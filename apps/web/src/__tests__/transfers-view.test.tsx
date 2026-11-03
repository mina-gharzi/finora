/**
 * @vitest-environment jsdom
 */
import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: { status: "idle" } as Record<string, unknown>,
  pending: false,
}));

vi.mock("@/app/actions/transfers", () => ({
  createTransferAction: vi.fn(),
  deleteTransferAction: vi.fn(),
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

import { CreateTransferForm } from "@/components/transfers/create-transfer-form";
import { TransfersView } from "@/components/transfers/transfers-view";
import type { TransferListItem } from "@/lib/finance/transfers";

const ACCOUNTS = [
  { id: "acc-1", name: "کیف پول نقدی" },
  { id: "acc-2", name: "بانک ملی" },
];

const TRANSFER: TransferListItem = {
  id: "tr-1",
  fromAccountId: "acc-1",
  fromAccountName: "کیف پول نقدی",
  toAccountId: "acc-2",
  toAccountName: "بانک ملی",
  amount: 50000,
  occurredOn: "2026-10-18",
  note: "",
};

beforeEach(() => {
  h.state = { status: "idle" };
  h.pending = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TransfersView", () => {
  it("shows the empty state when there are no transfers", () => {
    render(<TransfersView transfers={[]} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "انتقال بین حساب‌ها" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "هنوز انتقالی ثبت نکرده‌اید",
      }),
    ).toBeTruthy();

    const links = screen.getAllByRole("link", { name: "انتقال جدید" });
    expect(
      links.some(
        (link) => link.getAttribute("href") === "/accounts/transfers/new",
      ),
    ).toBe(true);
  });

  it("renders a transfer row with both account names and the amount", () => {
    render(<TransfersView transfers={[TRANSFER]} />);

    expect(
      screen.getByText("کیف پول نقدی ← بانک ملی"),
    ).toBeTruthy();
    expect(screen.getByText("50,000 تومان")).toBeTruthy();
    expect(screen.getByRole("button", { name: "حذف انتقال" })).toBeTruthy();
  });
});

describe("CreateTransferForm", () => {
  it("explains that two active accounts are needed when fewer exist", () => {
    render(<CreateTransferForm accounts={[ACCOUNTS[0]]} defaultDate="2026-10-18" />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "برای ثبت انتقال حداقل دو حساب فعال لازم است",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "مدیریت حساب‌ها" }).getAttribute("href"),
    ).toBe("/accounts");
    expect(screen.queryByLabelText(/از حساب/)).toBeNull();
  });

  it("renders both account selects with at least two accounts", () => {
    render(<CreateTransferForm accounts={ACCOUNTS} defaultDate="2026-10-18" />);

    expect(screen.getByLabelText(/از حساب/)).toBeTruthy();
    expect(screen.getByLabelText(/به حساب/)).toBeTruthy();
    expect(screen.getByLabelText(/مبلغ/)).toBeTruthy();
    expect(screen.getByLabelText(/تاریخ/)).toBeTruthy();
    expect(screen.getByLabelText(/توضیح/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "ثبت انتقال" })).toBeTruthy();

    expect((screen.getByLabelText(/از حساب/) as HTMLSelectElement).value).toBe(
      "acc-1",
    );
    expect((screen.getByLabelText(/به حساب/) as HTMLSelectElement).value).toBe(
      "acc-2",
    );
  });

  it("disables the destination option equal to the selected source", () => {
    render(<CreateTransferForm accounts={ACCOUNTS} defaultDate="2026-10-18" />);

    const toSelect = screen.getByLabelText(/به حساب/);
    const fromOption = within(toSelect).getByRole("option", {
      name: "کیف پول نقدی",
    }) as HTMLOptionElement;
    const otherOption = within(toSelect).getByRole("option", {
      name: "بانک ملی",
    }) as HTMLOptionElement;

    expect(fromOption.disabled).toBe(true);
    expect(otherOption.disabled).toBe(false);
  });
});
