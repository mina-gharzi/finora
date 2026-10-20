import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { authenticate, field } from "./helpers";

/** Reads a finished download back as UTF-8 text (BOM preserved). */
async function downloadText(download: {
  path(): Promise<string | null>;
}): Promise<string> {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Playwright did not record a download path");
  }
  return readFileSync(filePath, "utf8");
}

/** Creates the shared test account through the UI. */
async function seedAccount(page: Page): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill("بانک آزمایشی");
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText("بانک آزمایشی").first()).toBeVisible();
}

/** Records one transaction through the UI and waits for the confirmation. */
async function seedTransaction(
  page: Page,
  note: string,
  type: "expense" | "income" = "expense",
): Promise<void> {
  await page.goto("/transactions/new");
  await field(page, "amount").fill("150000");
  await field(page, "occurredOn").fill("2026-10-10");
  await page.locator('select[name="type"]:visible').selectOption(type);
  await field(page, "note").fill(note);
  await page.getByRole("button", { name: "ثبت تراکنش" }).click();
  await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();
}

/** Types the search term into the history filter form and submits it. */
async function search(page: Page, term: string): Promise<void> {
  await page.goto("/transactions");
  await field(page, "q").fill(term);
  await page.getByRole("button", { name: "اعمال فیلتر" }).click();
}

test.describe("transaction note search", () => {
  test("finds notes, composes with the type filter, and clears back to all rows", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccount(page);
    await seedTransaction(page, "خرید ناهار امروز");
    await seedTransaction(page, "حقوق ماهانه", "income");

    await search(page, "ناهار");
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByText("خرید ناهار امروز")).toBeVisible();
    await expect(page.getByText("حقوق ماهانه")).toHaveCount(0);

    // The search survives composing with an existing filter.
    await page.locator("#filter-type").selectOption("expense");
    await page.getByRole("button", { name: "اعمال فیلتر" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(page).toHaveURL(/type=expense/);
    await expect(page.getByText("خرید ناهار امروز")).toBeVisible();

    // Clearing removes every filter at once.
    await page.getByRole("link", { name: "پاک کردن" }).click();
    await expect(page).toHaveURL("/transactions");
    await expect(page.getByText("خرید ناهار امروز")).toBeVisible();
    await expect(page.getByText("حقوق ماهانه")).toBeVisible();
  });

  test("shows the search empty state, not the onboarding state, for no matches", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccount(page);
    await seedTransaction(page, "خرید ناهار امروز");

    await search(page, "قهوه‌خانه غیر موجود");

    await expect(
      page.getByText("تراکنشی مطابق جستجو یافت نشد"),
    ).toBeVisible();
    await expect(page.getByText("هنوز تراکنشی ثبت نشده است")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "پاک کردن" })).toBeVisible();
  });

  test("resets pagination when a new search is submitted", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccount(page);
    await seedTransaction(page, "خرید ناهار امروز");

    await page.goto("/transactions?page=2");
    await field(page, "q").fill("ناهار");
    await page.getByRole("button", { name: "اعمال فیلتر" }).click();

    await expect(page).toHaveURL(/q=/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText("خرید ناهار امروز")).toBeVisible();
  });

  test("matches % and _ literally instead of as wildcards", async ({
    page,
  }) => {
    await authenticate(page);
    await seedAccount(page);
    await seedTransaction(page, "تخفیف ویژه 50%_برای اعضا");
    await seedTransaction(page, "بدون علامت خاص");

    // An unescaped "_" would match any single character — and the wrapped
    // "%" around it would then match EVERY note. Only the literal row shows.
    await search(page, "_");
    await expect(page.getByText("تخفیف ویژه 50%_برای اعضا")).toBeVisible();
    await expect(page.getByText("بدون علامت خاص")).toHaveCount(0);

    // Same for "%": only the note containing a literal percent matches.
    await search(page, "50%");
    await expect(page.getByText("تخفیف ویژه 50%_برای اعضا")).toBeVisible();
    await expect(page.getByText("بدون علامت خاص")).toHaveCount(0);
  });

  test("never matches another user's notes", async ({ page }) => {
    await authenticate(page);
    await seedAccount(page);
    await seedTransaction(page, "عبارت اختصاصی الف");

    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    await authenticate(page);
    await search(page, "عبارت اختصاصی الف");

    await expect(
      page.getByText("تراکنشی مطابق جستجو یافت نشد"),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("exports only the searched rows to CSV", async ({ page }) => {
    await authenticate(page);
    await seedAccount(page);
    await seedTransaction(page, "خرید ناهار امروز");
    await seedTransaction(page, "اجاره ماهانه");

    await search(page, "ناهار");
    await expect(page.getByRole("link", { name: "خروجی CSV" })).toHaveAttribute(
      "href",
      /q=/,
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "خروجی CSV" }).click();
    const csv = await downloadText(await downloadPromise);

    expect(csv).toContain("خرید ناهار امروز");
    expect(csv).not.toContain("اجاره ماهانه");
  });
});
