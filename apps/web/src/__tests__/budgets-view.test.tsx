/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: { status: "idle" } as Record<string, unknown>,
  pending: false,
}));

vi.mock("@/app/actions/budgets", () => ({
  createBudgetAction: vi.fn(),
  updateBudgetAction: vi.fn(),
  deleteBudgetAction: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [h.state, () => {}, h.pending],
  };
});

import { BudgetsView } from "@/components/budgets/budgets-view";
import { CreateBudgetForm } from "@/components/budgets/create-budget-form";
import { EditBudgetForm } from "@/components/budgets/edit-budget-form";
import { DeleteBudgetButton } from "@/components/budgets/delete-budget-button";
import type {
  BudgetCategoryOption,
  BudgetWithProgress,
} from "@/lib/finance/budgets";
import { computeBudgetProgress } from "@/lib/finance/budget-status";

const MONTH_OPTIONS = [
  { param: "1405-07", label: "مهر 1405" },
  { param: "1405-06", label: "شهریور 1405" },
];

const CATEGORIES: BudgetCategoryOption[] = [
  { id: "cat-1", name: "خرید روزانه", archived: false },
  { id: "cat-2", name: "اجاره", archived: false },
];

function budget(
  overrides: Partial<BudgetWithProgress> & { id: string },
): BudgetWithProgress {
  return {
    categoryId: "cat-1",
    categoryName: "خرید روزانه",
    categoryArchived: false,
    monthStart: "2026-09-23",
    limitAmount: 1_000_000,
    progress: computeBudgetProgress(1_000_000, 0),
    ...overrides,
  };
}

function renderView(
  props: Partial<React.ComponentProps<typeof BudgetsView>> = {},
) {
  return render(
    <BudgetsView
      monthOptions={MONTH_OPTIONS}
      selectedParam="1405-07"
      monthLabel="مهر 1405"
      monthStart="2026-09-23"
      expenseCategories={CATEGORIES}
      budgets={[]}
      hasExpenseCategories
      {...props}
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

describe("BudgetsView — structure", () => {
  it("renders the heading and the month selector", () => {
    renderView();

    expect(
      screen.getByRole("heading", { level: 1, name: "بودجه‌ها" }),
    ).toBeTruthy();
    const month = screen.getByRole("combobox", {
      name: "ماه بودجه",
    }) as HTMLSelectElement;
    expect(month.value).toBe("1405-07");
    expect(screen.getByRole("option", { name: "شهریور 1405" })).toBeTruthy();
  });

  it("shows an empty state when the month has no budgets", () => {
    renderView();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "برای این ماه بودجه‌ای ثبت نشده است",
      }),
    ).toBeTruthy();
  });

  it("prompts to create an expense category when the owner has none", () => {
    renderView({ expenseCategories: [], hasExpenseCategories: false, budgets: [] });

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "هنوز دسته‌بندی هزینه‌ای ندارید",
      }),
    ).toBeTruthy();
    // No create form is offered without an eligible category.
    expect(screen.queryByRole("button", { name: "ثبت بودجه" })).toBeNull();
  });
});

describe("BudgetsView — progress and status", () => {
  it("shows limit, spending and remaining for an in-range budget", () => {
    renderView({
      budgets: [
        budget({ id: "b1", progress: computeBudgetProgress(1_000_000, 250_000) }),
      ],
    });

    // Scoped to the budget list: "خرید روزانه" also appears as a select option.
    const row = screen.getAllByRole("listitem")[0];
    expect(row.textContent).toContain("خرید روزانه");
    expect(screen.getByText("در محدوده بودجه")).toBeTruthy();
    expect(screen.getByText("1,000,000 تومان")).toBeTruthy();
    expect(screen.getByText("250,000 تومان")).toBeTruthy();
    expect(screen.getByText("750,000 تومان")).toBeTruthy();
  });

  it("shows the approaching status near the limit", () => {
    renderView({
      budgets: [
        budget({ id: "b1", progress: computeBudgetProgress(1_000_000, 850_000) }),
      ],
    });

    expect(screen.getByText("نزدیک به سقف")).toBeTruthy();
  });

  it("shows the reached status exactly at the limit", () => {
    renderView({
      budgets: [
        budget({ id: "b1", progress: computeBudgetProgress(1_000_000, 1_000_000) }),
      ],
    });

    expect(screen.getByText("به سقف رسید")).toBeTruthy();
    expect(screen.getByText("0 تومان")).toBeTruthy();
  });

  it("shows the exceeded status and preserves the overspend amount", () => {
    renderView({
      budgets: [
        budget({ id: "b1", progress: computeBudgetProgress(1_000_000, 1_200_000) }),
      ],
    });

    expect(screen.getByText("از سقف گذشت")).toBeTruthy();
    // Remaining is relabelled and shown as a negative overspend.
    expect(screen.getByText("بیش از سقف")).toBeTruthy();
    expect(screen.getByText("\u2212200,000 تومان")).toBeTruthy();
  });

  it("badges a budget whose category was archived", () => {
    renderView({
      budgets: [budget({ id: "b1", categoryArchived: true })],
    });

    expect(screen.getByText("دسته‌بندی بایگانی‌شده")).toBeTruthy();
  });
});

describe("CreateBudgetForm", () => {
  it("exposes a category select, a limit field and a hidden month", () => {
    render(
      <CreateBudgetForm
        categories={CATEGORIES}
        monthStart="2026-09-23"
        monthLabel="مهر 1405"
      />,
    );

    expect(screen.getByLabelText(/دسته‌بندی هزینه/)).toBeTruthy();
    expect(screen.getByLabelText(/سقف بودجه/)).toBeTruthy();
    expect(
      document.querySelector<HTMLInputElement>('input[name="monthStart"]')?.value,
    ).toBe("2026-09-23");
    expect(screen.getByRole("button", { name: "ثبت بودجه" })).toBeTruthy();
  });

  it("shows field and general feedback from the action", () => {
    h.state = {
      status: "error",
      message: "ثبت بودجه انجام نشد.",
      fieldErrors: { limitAmount: "مبلغ معتبر نیست." },
    };

    render(
      <CreateBudgetForm
        categories={CATEGORIES}
        monthStart="2026-09-23"
        monthLabel="مهر 1405"
      />,
    );

    expect(screen.getByText("مبلغ معتبر نیست.")).toBeTruthy();
    expect(screen.getByText("ثبت بودجه انجام نشد.")).toBeTruthy();
  });

  it("disables submit while pending", () => {
    h.pending = true;
    render(
      <CreateBudgetForm
        categories={CATEGORIES}
        monthStart="2026-09-23"
        monthLabel="مهر 1405"
      />,
    );

    expect(
      (screen.getByRole("button", { name: "ثبت بودجه" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("EditBudgetForm", () => {
  it("stays collapsed until activated, then prefills the limit and month", () => {
    render(
      <EditBudgetForm
        budgetId="b1"
        monthStart="2026-09-23"
        categoryId="cat-1"
        limitAmount={1_200_000}
        categories={CATEGORIES}
      />,
    );

    expect(screen.queryByLabelText(/سقف بودجه/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "ویرایش بودجه" }));

    expect((screen.getByLabelText(/سقف بودجه/) as HTMLInputElement).value).toBe(
      "1200000",
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="budgetId"]')?.value,
    ).toBe("b1");
    expect(screen.getByRole("button", { name: "ذخیره تغییرات" })).toBeTruthy();
  });

  it("can be backed out of", () => {
    render(
      <EditBudgetForm
        budgetId="b1"
        monthStart="2026-09-23"
        categoryId="cat-1"
        limitAmount={1_200_000}
        categories={CATEGORIES}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ویرایش بودجه" }));
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));

    expect(screen.queryByLabelText(/سقف بودجه/)).toBeNull();
  });
});

describe("DeleteBudgetButton", () => {
  it("requires confirmation before submitting", () => {
    render(<DeleteBudgetButton budgetId="b1" categoryName="خرید روزانه" />);

    expect(screen.queryByRole("button", { name: "تأیید حذف" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "حذف بودجه خرید روزانه" }));

    expect(screen.getByRole("button", { name: "تأیید حذف" })).toBeTruthy();
    expect(
      document.querySelector<HTMLInputElement>('input[name="budgetId"]')?.value,
    ).toBe("b1");
  });

  it("surfaces a failure message from the action", () => {
    h.state = { status: "error", message: "بودجه موردنظر یافت نشد." };

    render(<DeleteBudgetButton budgetId="b1" categoryName="خرید روزانه" />);

    expect(screen.getByText("بودجه موردنظر یافت نشد.")).toBeTruthy();
  });
});
