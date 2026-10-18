/**
 * @vitest-environment jsdom
 */
import type { AnchorHTMLAttributes } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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

vi.mock("@/app/actions/transactions", () => ({
  createTransactionAction: vi.fn(),
  updateTransactionAction: vi.fn(),
  deleteTransactionAction: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [{ status: "idle" }, () => {}, false],
  };
});

import {
  TransactionHistoryView,
  type TransactionHistoryViewProps,
} from "@/components/transactions/transaction-history-view";

afterEach(cleanup);

const ACCOUNTS = [
  { id: "acc-1", name: "بانک ملی" },
  { id: "acc-2", name: "کیف پول" },
];

const ITEMS: TransactionHistoryViewProps["items"] = [
  {
    id: "t1",
    type: "income",
    amount: 5000000,
    occurredOn: "2026-10-18",
    note: "حقوق مهر",
    accountId: "acc-1",
    accountName: "بانک ملی",
    categoryName: "حقوق",
  },
  {
    id: "t2",
    type: "expense",
    amount: 120000,
    occurredOn: "2026-10-19",
    note: "",
    accountId: "acc-2",
    accountName: "کیف پول",
    categoryName: null,
  },
];

const EMPTY_FILTERS = { type: "", accountId: "", from: "", to: "" };

function renderView(overrides: Partial<TransactionHistoryViewProps> = {}) {
  return render(
    <TransactionHistoryView
      items={ITEMS}
      accounts={ACCOUNTS}
      filters={EMPTY_FILTERS}
      page={1}
      prevHref={null}
      nextHref={null}
      hasActiveFilters={false}
      editHrefFor={(id) => `/transactions/${id}/edit`}
      deleteReturnTo="/transactions"
      {...overrides}
    />,
  );
}

describe("TransactionHistoryView — rows", () => {
  it("renders type, Toman amount, Jalali date, account, category and note", () => {
    renderView();

    const table = screen.getByRole("table", { name: "فهرست تراکنش‌ها" });

    expect(within(table).getByText("درآمد")).toBeTruthy();
    expect(within(table).getByText("هزینه")).toBeTruthy();

    expect(within(table).getByText("5,000,000 تومان")).toBeTruthy();
    expect(within(table).getByText("120,000 تومان")).toBeTruthy();

    // 2026-10-18 on the Gregorian calendar is 1405/07/26 in the Jalali calendar.
    expect(within(table).getByText("1405/07/26")).toBeTruthy();

    expect(within(table).getByText("حقوق")).toBeTruthy();
    expect(within(table).getByText("بدون دسته‌بندی")).toBeTruthy();

    expect(within(table).getByText("حقوق مهر")).toBeTruthy();
    expect(within(table).getByText("—")).toBeTruthy();
  });

  it("distinguishes income and expense amounts by colour", () => {
    renderView();

    expect(screen.getByText("5,000,000 تومان").className).toContain(
      "text-success",
    );
    expect(screen.getByText("120,000 تومان").className).toContain("text-danger");
  });

  it("offers an add-transaction link in the header", () => {
    renderView();

    const links = screen.getAllByRole("link", { name: "افزودن تراکنش" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/transactions/new");
    }
  });
});

describe("TransactionHistoryView — row actions", () => {
  it("links each row to its edit page using the provided href builder", () => {
    renderView({
      editHrefFor: (id) =>
        `/transactions/${id}/edit?returnTo=%2Ftransactions%3Ftype%3Dexpense`,
    });

    const editLinks = screen.getAllByRole("link", { name: "ویرایش تراکنش" });
    expect(editLinks).toHaveLength(ITEMS.length);
    expect(editLinks[0].getAttribute("href")).toBe(
      `/transactions/${ITEMS[0].id}/edit?returnTo=%2Ftransactions%3Ftype%3Dexpense`,
    );
  });

  it("offers a delete control per row with the row id in a hidden field", () => {
    const { container } = renderView();

    const deleteButtons = screen.getAllByRole("button", { name: "حذف تراکنش" });
    expect(deleteButtons).toHaveLength(ITEMS.length);

    for (const button of deleteButtons) fireEvent.click(button);

    const hiddenIds = Array.from(
      container.querySelectorAll('input[name="transactionId"]'),
    ).map((input) => (input as HTMLInputElement).value);
    expect(hiddenIds).toEqual([ITEMS[0].id, ITEMS[1].id]);
  });

  it("carries the delete return path in a hidden field", () => {
    const { container } = renderView({
      deleteReturnTo: "/transactions?page=2",
    });

    fireEvent.click(screen.getAllByRole("button", { name: "حذف تراکنش" })[0]);

    const hiddenReturns = Array.from(
      container.querySelectorAll('input[name="returnTo"]'),
    ).map((input) => (input as HTMLInputElement).value);
    expect(hiddenReturns).toContain("/transactions?page=2");
  });
});

describe("TransactionHistoryView — saved notice", () => {
  it("shows a success notice when a saved message is provided", () => {
    renderView({ savedMessage: "تراکنش با موفقیت ویرایش شد." });

    expect(
      screen.getByText("تراکنش با موفقیت ویرایش شد."),
    ).toBeTruthy();
  });

  it("shows no notice by default", () => {
    renderView();

    expect(screen.queryByText("تراکنش با موفقیت ویرایش شد.")).toBeNull();
  });
});

describe("TransactionHistoryView — filters", () => {
  it("applies the active filter values to the form controls", () => {
    renderView({
      filters: {
        type: "expense",
        accountId: "acc-2",
        from: "2026-01-01",
        to: "2026-12-31",
      },
      hasActiveFilters: true,
    });

    expect((screen.getByLabelText("نوع") as HTMLSelectElement).value).toBe(
      "expense",
    );
    expect(
      (screen.getByLabelText("حساب") as HTMLSelectElement).value,
    ).toBe("acc-2");
    expect((screen.getByLabelText("از تاریخ") as HTMLInputElement).value).toBe(
      "2026-01-01",
    );
    expect((screen.getByLabelText("تا تاریخ") as HTMLInputElement).value).toBe(
      "2026-12-31",
    );
  });

  it("lists the user's accounts as filter options", () => {
    renderView();

    const account = screen.getByLabelText("حساب") as HTMLSelectElement;
    expect(
      within(account).getByRole("option", { name: "بانک ملی" }),
    ).toBeTruthy();
    expect(
      within(account).getByRole("option", { name: "کیف پول" }),
    ).toBeTruthy();
  });

  it("only offers a clear-filters link when a filter is active", () => {
    const { unmount } = renderView();
    expect(screen.queryByRole("link", { name: "پاک کردن" })).toBeNull();
    unmount();

    renderView({ hasActiveFilters: true });
    const clear = screen.getByRole("link", { name: "پاک کردن" });
    expect(clear.getAttribute("href")).toBe("/transactions");
  });
});

describe("TransactionHistoryView — empty states", () => {
  it("invites the user to create the first transaction when none exist", () => {
    renderView({ items: [], hasActiveFilters: false, page: 1 });

    expect(
      screen.getByText("هنوز تراکنشی ثبت نشده است"),
    ).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "افزودن تراکنش" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/transactions/new");
    }
  });

  it("explains that filters matched nothing and offers to reset them", () => {
    renderView({ items: [], hasActiveFilters: true });

    expect(
      screen.getByText("تراکنشی مطابق فیلترها یافت نشد"),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "نمایش همه تراکنش‌ها" });
    expect(link.getAttribute("href")).toBe("/transactions");
  });
});

describe("TransactionHistoryView — pagination", () => {
  it("renders next/previous links when provided", () => {
    renderView({
      page: 2,
      prevHref: "/transactions?page=1",
      nextHref: "/transactions?page=3",
    });

    expect(screen.getByRole("link", { name: "قبلی" }).getAttribute("href")).toBe(
      "/transactions?page=1",
    );
    expect(screen.getByRole("link", { name: "بعدی" }).getAttribute("href")).toBe(
      "/transactions?page=3",
    );
    expect(screen.getByText("صفحه 2")).toBeTruthy();
  });

  it("hides pagination controls when there is only one page", () => {
    renderView();

    expect(screen.queryByRole("link", { name: "قبلی" })).toBeNull();
    expect(screen.queryByRole("link", { name: "بعدی" })).toBeNull();
  });
});
