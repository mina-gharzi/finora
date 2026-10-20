import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { authenticate, field } from "./helpers";

/**
 * The month selector is a plain GET-form `<select>`; scoping to `:visible`
 * sidesteps Next 16's hidden prefetched duplicate (see helpers.ts).
 */
function monthSelect(page: Page): Locator {
  return page.locator('select[name="month"]:visible');
}

/** Today as a Gregorian `YYYY-MM-DD` day, in UTC — the server's convention. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Creates an account and one expense so the reports page has real data. */
async function seedAccountAndExpense(page: Page): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill("بانک آزمایشی");
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText("بانک آزمایشی").first()).toBeVisible();

  await page.goto("/transactions/new");
  await field(page, "amount").fill("150000");
  await field(page, "occurredOn").fill(todayIso());
  await page.getByRole("button", { name: "ثبت تراکنش" }).click();
  await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();
}

test.describe("financial reports", () => {
  test("redirects unauthenticated visitors to the login page", async ({
    page,
  }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL("/login");
  });

  test("shows the empty state for a user with no transactions", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { level: 1, name: "گزارش‌ها" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "هنوز تراکنشی ثبت نشده است",
      }),
    ).toBeVisible();

    // A fresh user has no data to compare or chart.
    expect(await monthSelect(page).count()).toBe(0);
  });

  test("shows the selected month's expense total, comparison and trend", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccountAndExpense(page);

    await page.goto("/reports");
    await expect(
      page.getByRole("heading", { level: 1, name: "گزارش‌ها" }),
    ).toBeVisible();

    // Month selector with the current Jalali month preselected, and a range.
    const select = monthSelect(page);
    await expect(select).toBeVisible();
    const selectedValue = await select.inputValue();
    expect(selectedValue).toMatch(/^\d{4}-\d{2}$/);
    await expect(page.getByText(/بازه: \d{4}\/\d{2}\/\d{2} تا \d{4}\/\d{2}\/\d{2}/))
      .toBeVisible();

    // The expense total appears on a comparison card and in the trend.
    await expect(page.getByText("150,000 تومان").first()).toBeVisible();
    await expect(page.getByText("روند ماهانه")).toBeVisible();
    await expect(page.getByText(/خالص /).first()).toBeVisible();

    // The uncategorised expense is its own bucket and the largest one.
    await expect(page.getByText("بدون دسته‌بندی")).toBeVisible();
    await expect(page.getByText("بزرگ‌ترین")).toBeVisible();

    // Opening balances are disclosed as excluded from period metrics.
    await expect(
      page.getByText(/موجودی اولیه حساب‌ها در درآمد/),
    ).toBeVisible();
  });

  test("switches to the previous month and shows its empty state", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccountAndExpense(page);

    await page.goto("/reports");
    const select = monthSelect(page);
    const currentParam = await select.inputValue();

    // Options are newest first, so index 1 is the previous Jalali month.
    const previousValue = await select
      .locator("option")
      .nth(1)
      .getAttribute("value");
    expect(previousValue).toBeTruthy();
    expect(previousValue).not.toBe(currentParam);

    await select.selectOption(previousValue as string);
    await page.getByRole("button", { name: "نمایش" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/reports\\?month=${previousValue}$`),
    );

    // The fresh user's only transaction is in the current month, so the
    // previous month renders the zero/empty note and zero totals.
    await expect(
      page.getByText(/در این ماه تراکنشی ثبت نشده است/),
    ).toBeVisible();
    await expect(page.getByText("0 تومان").first()).toBeVisible();
  });
});
