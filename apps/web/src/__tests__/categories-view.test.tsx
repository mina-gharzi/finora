/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  state: { status: "idle" } as Record<string, unknown>,
  pending: false,
}));

vi.mock("@/app/actions/categories", () => ({
  createCategoryAction: vi.fn(),
  renameCategoryAction: vi.fn(),
  deleteCategoryAction: vi.fn(),
  setCategoryArchivedAction: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [h.state, () => {}, h.pending],
  };
});

import { CategoriesView } from "@/components/categories/categories-view";
import { CreateCategoryForm } from "@/components/categories/create-category-form";
import { DeleteCategoryButton } from "@/components/categories/delete-category-button";
import { RenameCategoryForm } from "@/components/categories/rename-category-form";
import { ArchiveCategoryButton } from "@/components/categories/archive-category-button";
import type { CategoryItem } from "@/components/categories/categories-view";

const CATEGORIES: CategoryItem[] = [
  { id: "cat-1", name: "حقوق", kind: "income", archived: false },
  { id: "cat-2", name: "خرید روزانه", kind: "expense", archived: false },
  { id: "cat-3", name: "اجاره", kind: "expense", archived: false },
];

beforeEach(() => {
  h.state = { status: "idle" };
  h.pending = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CategoriesView — type switch", () => {
  it("shows expense categories by default and switches to income", () => {
    render(<CategoriesView categories={CATEGORIES} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "دسته‌بندی‌ها" }),
    ).toBeTruthy();

    const expenseTab = screen.getByRole("tab", { name: /هزینه/ });
    const incomeTab = screen.getByRole("tab", { name: /درآمد/ });
    expect(expenseTab.getAttribute("aria-selected")).toBe("true");
    expect(incomeTab.getAttribute("aria-selected")).toBe("false");

    expect(screen.getByText("خرید روزانه")).toBeTruthy();
    expect(screen.getByText("اجاره")).toBeTruthy();
    expect(screen.queryByText("حقوق")).toBeNull();

    fireEvent.click(incomeTab);

    expect(screen.getByText("حقوق")).toBeTruthy();
    expect(screen.queryByText("خرید روزانه")).toBeNull();
    expect(screen.getByRole("tab", { name: /درآمد/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("shows a per-type empty state when a type has no categories", () => {
    render(
      <CategoriesView
        categories={[
          { id: "cat-1", name: "حقوق", kind: "income", archived: false },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "هنوز دسته‌بندی هزینه‌ای ثبت نشده است",
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /درآمد/ }));

    expect(screen.getByText("حقوق")).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        level: 2,
        name: "هنوز دسته‌بندی هزینه‌ای ثبت نشده است",
      }),
    ).toBeNull();
  });

  it("summarises each type with a count on its tab", () => {
    render(<CategoriesView categories={CATEGORIES} />);

    expect(screen.getByRole("tab", { name: /هزینه\s*2/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /درآمد\s*1/ })).toBeTruthy();
  });

  it("switches tabs with the keyboard", () => {
    render(<CategoriesView categories={CATEGORIES} />);

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });

    expect(
      screen.getByRole("tab", { name: /درآمد/ }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("offers rename and delete controls for each visible category", () => {
    render(<CategoriesView categories={CATEGORIES} />);

    expect(
      screen.getByRole("button", { name: "ویرایش نام دسته‌بندی خرید روزانه" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "حذف دسته‌بندی خرید روزانه" }),
    ).toBeTruthy();
  });
});

describe("CategoriesView — archived categories", () => {
  const WITH_ARCHIVED: CategoryItem[] = [
    { id: "cat-1", name: "قدیمی", kind: "expense", archived: true },
    { id: "cat-2", name: "خرید روزانه", kind: "expense", archived: false },
  ];

  it("badges archived categories and offers a restore control", () => {
    render(<CategoriesView categories={WITH_ARCHIVED} />);

    expect(screen.getByText("بایگانی‌شده")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "خروج از بایگانی دسته‌بندی قدیمی" }),
    ).toBeTruthy();
    // Active rows keep the plain archive trigger instead of the restore button.
    expect(
      screen.getByRole("button", { name: "بایگانی دسته‌بندی خرید روزانه" }),
    ).toBeTruthy();
  });

  it("sorts active categories before archived ones within a kind", () => {
    render(<CategoriesView categories={WITH_ARCHIVED} />);

    const rows = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    const activeIndex = rows.findIndex((row) => row.includes("خرید روزانه"));
    const archivedIndex = rows.findIndex((row) => row.includes("قدیمی"));
    expect(activeIndex).toBeGreaterThanOrEqual(0);
    expect(archivedIndex).toBeGreaterThan(activeIndex);
  });

  it("counts archived categories on their kind tab and keeps rename/delete", () => {
    render(<CategoriesView categories={WITH_ARCHIVED} />);

    expect(screen.getByRole("tab", { name: /هزینه\s*2/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "ویرایش نام دسته‌بندی قدیمی" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "حذف دسته‌بندی قدیمی" }),
    ).toBeTruthy();
  });
});

describe("ArchiveCategoryButton", () => {
  it("requires an explicit confirmation before archiving", () => {
    render(
      <ArchiveCategoryButton
        categoryId="cat-1"
        categoryName="خرید روزانه"
        archived={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "تأیید بایگانی" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "بایگانی دسته‌بندی خرید روزانه" }),
    );

    expect(screen.getByRole("button", { name: "تأیید بایگانی" })).toBeTruthy();
    expect(
      document.querySelector<HTMLInputElement>('input[name="archived"]')?.value,
    ).toBe("true");
  });

  it("restores on a single click with the archived flag cleared", () => {
    render(
      <ArchiveCategoryButton
        categoryId="cat-1"
        categoryName="خرید روزانه"
        archived={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: "خروج از بایگانی دسته‌بندی خرید روزانه" }),
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLInputElement>('input[name="archived"]')?.value,
    ).toBe("false");
  });

  it("surfaces a failure message from the action", () => {
    h.state = { status: "error", message: "دسته‌بندی موردنظر یافت نشد." };

    render(
      <ArchiveCategoryButton
        categoryId="cat-1"
        categoryName="خرید روزانه"
        archived={false}
      />,
    );

    expect(screen.getByText("دسته‌بندی موردنظر یافت نشد.")).toBeTruthy();
  });
});

describe("CreateCategoryForm", () => {
  it("exposes a name field and an income/expense kind field", () => {
    render(<CreateCategoryForm />);

    expect(screen.getByLabelText(/نام دسته‌بندی/)).toBeTruthy();
    const kind = screen.getByLabelText(/نوع دسته‌بندی/) as HTMLSelectElement;
    expect(kind.value).toBe("income");
    expect(screen.getByRole("option", { name: "هزینه" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "افزودن دسته‌بندی" })).toBeTruthy();
  });

  it("shows field-level and general feedback returned by the action", () => {
    h.state = {
      status: "error",
      message: "ثبت دسته‌بندی انجام نشد.",
      fieldErrors: { name: "نام را وارد کنید." },
    };

    render(<CreateCategoryForm />);

    expect(screen.getByText("نام را وارد کنید.")).toBeTruthy();
    expect(screen.getByText("ثبت دسته‌بندی انجام نشد.")).toBeTruthy();
  });

  it("shows a success message after creation", () => {
    h.state = { status: "success", message: "دسته‌بندی جدید با موفقیت ثبت شد." };

    render(<CreateCategoryForm />);

    expect(
      screen.getByText("دسته‌بندی جدید با موفقیت ثبت شد."),
    ).toBeTruthy();
  });

  it("disables the submit button while a submission is pending", () => {
    h.pending = true;

    render(<CreateCategoryForm />);

    const submit = screen.getByRole("button", {
      name: "افزودن دسته‌بندی",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});

describe("RenameCategoryForm", () => {
  it("stays collapsed until the user activates it, then prefills the name", () => {
    render(<RenameCategoryForm categoryId="cat-1" name="خرید روزانه" />);

    expect(screen.queryByLabelText(/نام جدید/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "ویرایش نام دسته‌بندی خرید روزانه" }),
    );

    const input = screen.getByLabelText(/نام جدید/) as HTMLInputElement;
    expect(input.value).toBe("خرید روزانه");
    expect(
      document.querySelector<HTMLInputElement>('input[name="categoryId"]')?.value,
    ).toBe("cat-1");
    expect(screen.getByRole("button", { name: "ذخیره" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "انصراف" })).toBeTruthy();
  });

  it("lets the user back out of editing", () => {
    render(<RenameCategoryForm categoryId="cat-1" name="خرید روزانه" />);

    fireEvent.click(
      screen.getByRole("button", { name: "ویرایش نام دسته‌بندی خرید روزانه" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));

    expect(screen.queryByLabelText(/نام جدید/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "ویرایش نام دسته‌بندی خرید روزانه" }),
    ).toBeTruthy();
  });

  it("disables the controls while a rename is pending", () => {
    h.pending = true;
    render(<RenameCategoryForm categoryId="cat-1" name="خرید روزانه" />);

    fireEvent.click(
      screen.getByRole("button", { name: "ویرایش نام دسته‌بندی خرید روزانه" }),
    );

    expect(
      (screen.getByRole("button", { name: "ذخیره" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "انصراف" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("surfaces a failure message from the action", () => {
    h.state = { status: "error", message: "دسته‌بندی موردنظر یافت نشد." };

    render(<RenameCategoryForm categoryId="cat-1" name="خرید روزانه" />);

    expect(screen.getByText("دسته‌بندی موردنظر یافت نشد.")).toBeTruthy();
  });
});

describe("DeleteCategoryButton", () => {
  it("requires an explicit confirmation before submitting", () => {
    render(<DeleteCategoryButton categoryId="cat-1" categoryName="خرید روزانه" />);

    expect(screen.queryByRole("button", { name: "تأیید حذف" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "حذف دسته‌بندی خرید روزانه" }),
    );

    expect(screen.getByRole("button", { name: "تأیید حذف" })).toBeTruthy();
    expect(
      document.querySelector<HTMLInputElement>('input[name="categoryId"]')?.value,
    ).toBe("cat-1");
  });

  it("lets the user back out of the confirmation step", () => {
    render(<DeleteCategoryButton categoryId="cat-1" categoryName="خرید روزانه" />);

    fireEvent.click(
      screen.getByRole("button", { name: "حذف دسته‌بندی خرید روزانه" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));

    expect(screen.queryByRole("button", { name: "تأیید حذف" })).toBeNull();
  });

  it("disables the controls while a deletion is pending", () => {
    h.pending = true;
    render(<DeleteCategoryButton categoryId="cat-1" categoryName="خرید روزانه" />);

    fireEvent.click(
      screen.getByRole("button", { name: "حذف دسته‌بندی خرید روزانه" }),
    );

    expect(
      (screen.getByRole("button", { name: "تأیید حذف" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "انصراف" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("surfaces the reference-safety failure message", () => {
    h.state = {
      status: "error",
      message: "این دسته‌بندی در 3 تراکنش استفاده شده است.",
    };

    render(<DeleteCategoryButton categoryId="cat-1" categoryName="خرید روزانه" />);

    expect(
      screen.getByText("این دسته‌بندی در 3 تراکنش استفاده شده است."),
    ).toBeTruthy();
  });
});
