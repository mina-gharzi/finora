import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { authenticate, field } from "./helpers";

/** Today as a `YYYY-MM-DD` calendar day in Asia/Tehran. */
function tehranTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Adds whole days to a `YYYY-MM-DD` calendar day. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Creates the shared test account through the UI. */
async function seedAccount(page: Page): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill("بانک تکرارشونده");
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText("بانک تکرارشونده").first()).toBeVisible();
}

test.describe("recurring transactions", () => {
  test("generates due weekly rows and keeps them after the rule is deleted", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccount(page);

    const today = tehranTodayIso();
    const startOn = addDays(today, -15);
    const weekday = new Date(`${startOn}T00:00:00Z`).getUTCDay();
    const note = "e2e recurring";

    await page.goto("/transactions/recurring/new");
    await page.locator('select[name="type"]:visible').selectOption("expense");
    await field(page, "amount").fill("150000");
    await page.locator('select[name="frequency"]:visible').selectOption("weekly");
    await page
      .locator('select[name="weekday"]:visible')
      .selectOption(String(weekday));
    await field(page, "startOn").fill(startOn);
    await field(page, "note").fill(note);
    await page.getByRole("button", { name: "ثبت قانون" }).click();

    // The rule is listed after the redirect.
    await expect(page).toHaveURL("/transactions/recurring");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "تراکنش‌های تکرارشونده",
      }),
    ).toBeVisible();
    await expect(page.getByText(note)).toBeVisible();

    // Start, +7 and +14 days are all due and carry the recurring badge.
    await page.goto("/transactions");
    const table = page.getByRole("table", { name: "فهرست تراکنش‌ها" });
    await expect(table.getByText(note)).toHaveCount(3);
    await expect(table.getByText("تکرارشونده")).toHaveCount(3);

    // Deleting the rule must not delete the transactions it generated.
    await page.goto("/transactions/recurring");
    await page
      .getByRole("button", { name: "حذف قانون تکرارشونده" })
      .click();
    await expect(
      page.getByText(
        "این قانون حذف شود؟ تراکنش‌های ثبت‌شده‌ی قبلی حفظ می‌شوند.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "تأیید حذف" }).click();
    await expect(page.getByText(note)).toHaveCount(0);

    await page.goto("/transactions");
    const history = page.getByRole("table", { name: "فهرست تراکنش‌ها" });
    await expect(history.getByText(note)).toHaveCount(3);
    await expect(history.getByText("تکرارشونده")).toHaveCount(3);
  });
});
