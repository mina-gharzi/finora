import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { authenticate, field } from "./helpers";

/** The month selector is a plain GET-form `<select>`; scope to the visible one. */
function monthSelect(page: Page): Locator {
  return page.locator('select[name="month"]:visible');
}

/** Today as a Gregorian `YYYY-MM-DD` day, in UTC — the server's convention. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Creates the shared account through the UI. */
async function seedAccount(page: Page): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill("بانک آزمایشی");
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText("بانک آزمایشی").first()).toBeVisible();
}

/** Creates an expense category through the UI and waits for confirmation. */
async function seedCategory(page: Page, name: string): Promise<void> {
  await page.goto("/categories");
  await field(page, "name").fill(name);
  await page.locator('select[name="kind"]:visible').selectOption("expense");
  await page.getByRole("button", { name: "افزودن دسته‌بندی" }).click();
  await expect(page.getByText("دسته‌بندی جدید با موفقیت ثبت شد.")).toBeVisible();
}

/** Records one expense (or income) transaction in the current month. */
async function seedTransaction(
  page: Page,
  amount: string,
  note: string,
  options: { type?: "income" | "expense"; categoryName?: string } = {},
): Promise<void> {
  await page.goto("/transactions/new");
  if (options.type === "income") {
    await page.locator('select[name="type"]:visible').selectOption("income");
  }
  await field(page, "amount").fill(amount);
  await field(page, "occurredOn").fill(todayIso());
  await field(page, "note").fill(note);
  if (options.categoryName) {
    await page
      .locator('select[name="categoryId"]:visible')
      .selectOption({ label: options.categoryName });
  }
  await page.getByRole("button", { name: "ثبت تراکنش" }).click();
  await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();
}

/** The create form and its fields (scoped so the edit form never collides). */
function createForm(page: Page): Locator {
  return page.locator('form[aria-label="فرم ثبت بودجه"]');
}

/** The inline edit form and its fields. */
function editForm(page: Page): Locator {
  return page.locator('form[aria-label="فرم ویرایش بودجه"]');
}

/** Creates a budget for the currently selected month through the UI. */
async function createBudget(
  page: Page,
  categoryName: string,
  limit: string,
): Promise<void> {
  const form = createForm(page);
  await form
    .locator('select[name="categoryId"]')
    .selectOption({ label: categoryName });
  await form.locator('input[name="limitAmount"]').fill(limit);
  await form.getByRole("button", { name: "ثبت بودجه" }).click();
  await expect(page.getByText("بودجه با موفقیت ثبت شد.")).toBeVisible();
}

test.describe("monthly budgets", () => {
  test("redirects unauthenticated visitors to the login page", async ({
    page,
  }) => {
    await page.goto("/budgets");
    await expect(page).toHaveURL("/login");
  });

  test("prompts for an expense category when the owner has none", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto("/budgets");
    await expect(
      page.getByRole("heading", { level: 1, name: "بودجه‌ها" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "هنوز دسته‌بندی هزینه‌ای ندارید",
      }),
    ).toBeVisible();
  });

  test("creates a budget and reflects real spending, status and remaining", async ({
    page,
  }) => {
    const category = `خرید ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, category);
    // A 300,000 expense exists before the budget is set.
    await seedTransaction(page, "300000", "خرید اول", { categoryName: category });

    await page.goto("/budgets");
    // The selected month defaults to the current Jalali month.
    const selected = await monthSelect(page).inputValue();
    expect(selected).toMatch(/^\d{4}-\d{2}$/);

    await createBudget(page, category, "1000000");

    // The budget row shows the limit, spending, remaining and in-range status.
    await expect(page.getByText("در محدوده بودجه")).toBeVisible();
    await expect(page.getByText("1,000,000 تومان")).toBeVisible();
    await expect(page.getByText("300,000 تومان")).toBeVisible();
    await expect(page.getByText("700,000 تومان")).toBeVisible();

    // A second real expense of 500,000 pushes spending to 800,000 (approaching:
    // 80% of the limit, the warning threshold).
    await seedTransaction(page, "500000", "خرید دوم", { categoryName: category });
    await page.goto("/budgets");
    await expect(page.getByText("نزدیک به سقف")).toBeVisible();
    await expect(page.getByText("800,000 تومان")).toBeVisible();

    // A third expense of 300,000 overshoots the limit by 100,000.
    await seedTransaction(page, "300000", "خرید سوم", { categoryName: category });
    await page.goto("/budgets");
    await expect(page.getByText("از سقف گذشت")).toBeVisible();
    await expect(page.getByText("بیش از سقف").first()).toBeVisible();
    await expect(page.getByText("\u2212100,000 تومان").first()).toBeVisible();
  });

  test("does not inflate expense spending with income transactions", async ({
    page,
  }) => {
    const category = `حقوق ستاره ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, category);
    await seedTransaction(page, "200000", "هزینه اولیه", {
      categoryName: category,
    });
    // Income categories cannot budget, so use an unrelated income row.
    await seedTransaction(page, "5000000", "حقوق ماه", { type: "income" });

    await page.goto("/budgets");
    await createBudget(page, category, "1000000");

    // Only the 200,000 expense counts toward the budget's spending.
    await expect(page.getByText("200,000 تومان")).toBeVisible();
    await expect(page.getByText("800,000 تومان")).toBeVisible();
    await expect(page.getByText("5,000,000 تومان")).toHaveCount(0);
  });

  test("edits a budget's limit and removes it", async ({ page }) => {
    const category = `اشتراک ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, category);
    await seedTransaction(page, "100000", "اشتراک", { categoryName: category });

    await page.goto("/budgets");
    await createBudget(page, category, "500000");
    await expect(page.getByText("500,000 تومان").first()).toBeVisible();

    await page.getByRole("button", { name: "ویرایش بودجه" }).click();
    await editForm(page).locator('input[name="limitAmount"]').fill("900000");
    await page.getByRole("button", { name: "ذخیره تغییرات" }).click();
    await expect(page.getByText("بودجه با موفقیت ویرایش شد.")).toBeVisible();
    await expect(page.getByText("900,000 تومان").first()).toBeVisible();

    await page.getByRole("button", { name: `حذف بودجه ${category}` }).click();
    await page.getByRole("button", { name: "تأیید حذف" }).click();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "برای این ماه بودجه‌ای ثبت نشده است",
      }),
    ).toBeVisible();
  });

  test("rejects a duplicate budget for the same category and month", async ({
    page,
  }) => {
    const category = `بنزین ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, category);

    await page.goto("/budgets");
    await createBudget(page, category, "400000");
    // Submitting the same category and month again is refused safely.
    const form = createForm(page);
    await form
      .locator('select[name="categoryId"]')
      .selectOption({ label: category });
    await form.locator('input[name="limitAmount"]').fill("600000");
    await form.getByRole("button", { name: "ثبت بودجه" }).click();
    await expect(page.getByText(/از قبل بودجه ثبت شده است/)).toBeVisible();
  });

  test("switches months and keeps each month's budgets separate", async ({
    page,
  }) => {
    const category = `تفریح ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, category);

    await page.goto("/budgets");
    await createBudget(page, category, "300000");
    const currentParam = await monthSelect(page).inputValue();

    // Options are newest first; index 1 is the previous Jalali month.
    const previousValue = await monthSelect(page)
      .locator("option")
      .nth(1)
      .getAttribute("value");
    expect(previousValue).toBeTruthy();
    expect(previousValue).not.toBe(currentParam);

    await monthSelect(page).selectOption(previousValue as string);
    await page.getByRole("button", { name: "نمایش" }).click();
    await expect(page).toHaveURL(new RegExp(`/budgets\\?month=${previousValue}$`));

    // The previous month has no budget of its own.
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "برای این ماه بودجه‌ای ثبت نشده است",
      }),
    ).toBeVisible();
  });

  test("never exposes another user's budgets", async ({ page }) => {
    const category = `سفر ${Date.now()}`;

    // User A creates a budget.
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, category);
    await page.goto("/budgets");
    await createBudget(page, category, "250000");
    await expect(page.getByText("250,000 تومان").first()).toBeVisible();

    // Sign out, then a brand-new user registers and sees none of it.
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    await authenticate(page);
    await page.goto("/budgets");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "هنوز دسته‌بندی هزینه‌ای ندارید",
      }),
    ).toBeVisible();
    await expect(page.getByText(category)).toHaveCount(0);
    await expect(page.getByText("250,000 تومان")).toHaveCount(0);
  });
});
