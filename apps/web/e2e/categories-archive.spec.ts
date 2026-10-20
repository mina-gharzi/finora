import { expect, test, type Page } from "@playwright/test";
import { authenticate, field } from "./helpers";

/** Creates the shared test account through the UI. */
async function seedAccount(page: Page): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill("بانک آزمایشی");
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText("بانک آزمایشی").first()).toBeVisible();
}

/** Creates an expense category through the UI and waits for the confirmation. */
async function seedCategory(page: Page, name: string): Promise<void> {
  await page.goto("/categories");
  await field(page, "name").fill(name);
  await page.locator('select[name="kind"]:visible').selectOption("expense");
  await page.getByRole("button", { name: "افزودن دسته‌بندی" }).click();
  await expect(page.getByText("دسته‌بندی جدید با موفقیت ثبت شد.")).toBeVisible();
}

/** Records one expense transaction, optionally with the given category. */
async function seedTransaction(
  page: Page,
  note: string,
  categoryName?: string,
): Promise<void> {
  await page.goto("/transactions/new");
  await field(page, "amount").fill("150000");
  await field(page, "occurredOn").fill("2026-10-10");
  await field(page, "note").fill(note);
  if (categoryName) {
    await page
      .locator('select[name="categoryId"]:visible')
      .selectOption({ label: categoryName });
  }
  await page.getByRole("button", { name: "ثبت تراکنش" }).click();
  await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();
}

/** Archives the named category from the management page (with confirmation). */
async function archiveCategory(page: Page, name: string): Promise<void> {
  await page.goto("/categories");
  await page
    .getByRole("button", { name: `بایگانی دسته‌بندی ${name}` })
    .click();
  await page.getByRole("button", { name: "تأیید بایگانی" }).click();
  // Flip verified by the control itself: the restore button takes over.
  await expect(
    page.getByRole("button", { name: `خروج از بایگانی دسته‌بندی ${name}` }),
  ).toBeVisible();
}

/** Restores the named category from the management page (single click). */
async function restoreCategory(page: Page, name: string): Promise<void> {
  await page.goto("/categories");
  await page
    .getByRole("button", { name: `خروج از بایگانی دسته‌بندی ${name}` })
    .click();
  await expect(
    page.getByRole("button", { name: `بایگانی دسته‌بندی ${name}` }),
  ).toBeVisible();
}

test.describe("category archive and restore", () => {
  test.beforeEach(async ({ context }) => {
    // Isolate per-test IP so process-local limiters don't cross-contaminate.
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.105.${(Date.now() % 250) + 1}`,
    });
  });

  test("archives a category, hides it from new transactions, then restores it", async ({
    page,
  }) => {
    const name = `قهوه ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, name);

    // The active category is offered for a new transaction.
    await page.goto("/transactions/new");
    await expect(
      page.locator('select[name="categoryId"] option', { hasText: name }),
    ).toHaveCount(1);

    // Archive it from the management page (two-step confirmation).
    await archiveCategory(page, name);
    await expect(page.getByText("بایگانی‌شده")).toBeVisible();

    // No longer offered for NEW transactions — the select omits it entirely.
    await page.goto("/transactions/new");
    await expect(
      page.locator('select[name="categoryId"] option', { hasText: name }),
    ).toHaveCount(0);
    // Creating a transaction without a category still works.
    await seedTransaction(page, "خرید بدون دسته‌بندی");

    // Historical views keep showing the category name on old rows.
    await page.goto("/categories");
    await restoreCategory(page, name);
    await expect(page.getByText("بایگانی‌شده")).toHaveCount(0);

    // Selectable again for new transactions.
    await page.goto("/transactions/new");
    await expect(
      page.locator('select[name="categoryId"] option', { hasText: name }),
    ).toHaveCount(1);
  });

  test("keeps a transaction editable on its archived category and shows it in history", async ({
    page,
  }) => {
    const name = `اشتراک ${Date.now()}`;
    await authenticate(page);
    await seedAccount(page);
    await seedCategory(page, name);
    await seedTransaction(page, "پرداخت اشتراک", name);

    // Archive the category while a transaction still references it.
    await archiveCategory(page, name);

    // The history row still displays the category name (join is unaffected).
    await page.goto("/transactions");
    await expect(page.getByText(name).first()).toBeVisible();

    // The edit page keeps the transaction's own archived category selected.
    await page.getByRole("link", { name: "ویرایش تراکنش" }).click();
    const select = page.locator('select[name="categoryId"]:visible');
    await expect(select).toHaveValue(/.+/);
    await expect(
      page.locator('select[name="categoryId"] option:checked', { hasText: name }),
    ).toHaveCount(1);
    await expect(
      page.locator('select[name="categoryId"] option:checked', {
        hasText: "بایگانی‌شده",
      }),
    ).toHaveCount(1);

    // Saving without touching the category succeeds — the row stays editable.
    await page.getByRole("button", { name: "ذخیره تغییرات" }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText("تراکنش با موفقیت ویرایش شد.")).toBeVisible();
  });
});
