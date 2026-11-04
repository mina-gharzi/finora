/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import {
  CreateRecurringForm,
  type AccountOption,
  type CategoryOption,
} from "@/components/recurring/create-recurring-form";
import { jalaliParts } from "@/lib/finance/dashboard-range";

const DEFAULT_DATE = "2026-10-18";

const ACCOUNTS: AccountOption[] = [
  { id: "acc-1", name: "کیف پول نقدی" },
  { id: "acc-2", name: "بانک ملی" },
];

const CATEGORIES: CategoryOption[] = [
  { id: "cat-income", name: "حقوق", kind: "income" },
  { id: "cat-expense", name: "خرید روزانه", kind: "expense" },
];

function renderForm() {
  return render(
    <CreateRecurringForm
      accounts={ACCOUNTS}
      categories={CATEGORIES}
      defaultDate={DEFAULT_DATE}
    />,
  );
}

function select(name: string): HTMLSelectElement {
  return document.querySelector(`select[name="${name}"]`) as HTMLSelectElement;
}

afterEach(cleanup);

describe("CreateRecurringForm", () => {
  it("defaults to a monthly rule with the Jalali day of the start date", () => {
    renderForm();

    expect(screen.getByText("ثبت قانون")).toBeTruthy();
    expect(select("dayOfMonth").value).toBe(
      String(jalaliParts(DEFAULT_DATE).day),
    );
    expect(select("weekday")).toBeNull();
    expect(
      screen.getByText(
        "اگر ماه روز ۳۱ نداشته باشد، در آخرین روز ماه ثبت می‌شود.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "تراکنش‌های سررسیدشده از تاریخ شروع، بلافاصله ثبت می‌شوند.",
      ),
    ).toBeTruthy();
    expect(
      (document.querySelector('input[name="startOn"]') as HTMLInputElement)
        .value,
    ).toBe(DEFAULT_DATE);
  });

  it("swaps the monthly day field for a weekday field on weekly rules", () => {
    renderForm();

    fireEvent.change(select("frequency"), {
      target: { value: "weekly" },
    });

    expect(select("dayOfMonth")).toBeNull();
    expect(select("weekday")).not.toBeNull();
    expect(select("weekday").value).toBe(
      String(new Date(`${DEFAULT_DATE}T00:00:00Z`).getUTCDay()),
    );
    expect(screen.queryByText("روز ماه")).toBeNull();
    expect(screen.getByText("روز هفته")).toBeTruthy();
  });

  it("filters the category options by the chosen transaction type", () => {
    renderForm();

    const categorySelect = screen.getByLabelText("دسته‌بندی");
    expect(
      within(categorySelect).queryByRole("option", { name: "خرید روزانه" }),
    ).not.toBeNull();
    expect(
      within(categorySelect).queryByRole("option", { name: "حقوق" }),
    ).toBeNull();

    fireEvent.change(select("type"), {
      target: { value: "income" },
    });

    expect(
      within(categorySelect).queryByRole("option", { name: "حقوق" }),
    ).not.toBeNull();
    expect(
      within(categorySelect).queryByRole("option", { name: "خرید روزانه" }),
    ).toBeNull();
  });
});
