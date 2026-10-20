import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { authenticate, field } from "./helpers";

/** The range selector is a plain GET-form `<select>`; scope to the visible one. */
function rangeSelect(page: Page): Locator {
  return page.locator('select[name="range"]:visible');
}

/** Today as a Gregorian `YYYY-MM-DD` day, in UTC — the server's convention. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Creates an account with a known opening balance through the UI. */
async function seedAccount(page: Page, openingBalance: string): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill("بانک آزمایشی");
  await field(page, "openingBalance").fill(openingBalance);
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText("بانک آزمایشی").first()).toBeVisible();
}

/** Records one income or expense transaction in the current month. */
async function seedTransaction(
  page: Page,
  amount: string,
  type: "income" | "expense",
): Promise<void> {
  await page.goto("/transactions/new");
  await page.locator('select[name="type"]:visible').selectOption(type);
  await field(page, "amount").fill(amount);
  await field(page, "occurredOn").fill(todayIso());
  await page.getByRole("button", { name: "ثبت تراکنش" }).click();
  await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();
}

test.describe("historical balance trend", () => {
  test("redirects unauthenticated visitors to the login page", async ({
    page,
  }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL("/login");
  });

  test("plots the combined tracked-account balance from real data", async ({
    page,
  }) => {
    await authenticate(page);
    // Opening balance 1,000,000, income 500,000, expense 200,000.
    await seedAccount(page, "1000000");
    await seedTransaction(page, "500000", "income");
    await seedTransaction(page, "200000", "expense");

    await page.goto("/reports");

    await expect(
      page.getByText("روند موجودی حساب‌ها"),
    ).toBeVisible();
    // The metric is named honestly, not called net worth.
    await expect(page.getByText(/نه ارزش خالص دارایی‌ها/)).toBeVisible();

    // 1,000,000 + 500,000 − 200,000 = 1,300,000 as the current balance.
    await expect(
      page.getByText("+1,300,000 تومان").first(),
    ).toBeVisible();

    // The window defaults to twelve months and the selector is present.
    await expect(rangeSelect(page)).toBeVisible();
    await expect(rangeSelect(page)).toHaveValue("12");
  });

  test("switches the window length and preserves it in the URL", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccount(page, "1000000");
    await seedTransaction(page, "100000", "income");

    await page.goto("/reports");
    const rangeForm = page
      .locator("form")
      .filter({ has: page.locator('select[name="range"]') });
    await rangeSelect(page).selectOption("24");
    await rangeForm.getByRole("button", { name: "نمایش" }).click();

    await expect(page).toHaveURL(/range=24/);
    await expect(rangeSelect(page)).toHaveValue("24");
    await expect(page.getByText("روند موجودی حساب‌ها")).toBeVisible();
  });

  test("shows an empty-state note for a user with no transactions", async ({
    page,
  }) => {
    await authenticate(page);
    await page.goto("/reports");

    // Without transactions the reports page collapses to its onboarding state.
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "هنوز تراکنشی ثبت نشده است",
      }),
    ).toBeVisible();
    await expect(page.getByText("روند موجودی حساب‌ها")).toHaveCount(0);
  });

  test("never exposes another user's balance", async ({ page }) => {
    await authenticate(page);
    await seedAccount(page, "9000000");
    await seedTransaction(page, "1000000", "income");

    await page.goto("/reports");
    await expect(page.getByText("+10,000,000 تومان").first()).toBeVisible();

    // Sign out, then a brand-new user sees none of the previous user's money.
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    await authenticate(page);
    await page.goto("/reports");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "هنوز تراکنشی ثبت نشده است",
      }),
    ).toBeVisible();
    await expect(page.getByText("+10,000,000 تومان")).toHaveCount(0);
  });
});
