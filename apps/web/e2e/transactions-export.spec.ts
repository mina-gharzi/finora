import { readFileSync } from "node:fs";
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

test.describe("transaction CSV export", () => {
  test("redirects unauthenticated visitors to the login page", async ({
    page,
  }) => {
    await page.goto("/transactions/export");
    await expect(page).toHaveURL("/login");
  });

  test("keeps the active history filter in the export link", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto("/transactions");
    await page.locator("#filter-type").selectOption("expense");
    await page.getByRole("button", { name: "اعمال فیلتر" }).click();
    await expect(page).toHaveURL(/type=expense/);

    await expect(page.getByRole("link", { name: "خروجی CSV" })).toHaveAttribute(
      "href",
      "/transactions/export?type=expense",
    );
  });

  test("downloads a UTF-8 CSV of the user's transactions", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto("/accounts");
    await field(page, "name").fill("بانک آزمایشی");
    await page.getByRole("button", { name: "افزودن حساب" }).click();
    await expect(page.getByText("بانک آزمایشی").first()).toBeVisible();

    await page.goto("/transactions/new");
    await field(page, "amount").fill("150000");
    await field(page, "occurredOn").fill("2026-10-10");
    await field(page, "note").fill("خرید, آزمایشی");
    await page.getByRole("button", { name: "ثبت تراکنش" }).click();
    await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();

    await page.goto("/transactions");
    await expect(page.getByText("خرید, آزمایشی")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "خروجی CSV" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^finora-transactions-\d{4}-\d{2}-\d{2}\.csv$/,
    );

    const csv = await downloadText(download);
    // UTF-8 BOM so spreadsheet apps detect the encoding.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(
      "تاریخ (میلادی),نوع تراکنش,مبلغ (تومان),حساب,دسته‌بندی,توضیحات",
    );
    // Verbatim Gregorian date, bare integer amount, Persian labels and the
    // comma-bearing note RFC 4180-quoted on one line.
    expect(csv).toContain("2026-10-10,هزینه,150000,بانک آزمایشی");
    expect(csv).toContain('"خرید, آزمایشی"');
  });

  test("exports a headers-only file when the user has no transactions", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto("/transactions");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "خروجی CSV" }).click();
    const download = await downloadPromise;

    const csv = await downloadText(download);
    expect(csv).toBe(
      "\uFEFFتاریخ (میلادی),نوع تراکنش,مبلغ (تومان),حساب,دسته‌بندی,توضیحات\r\n",
    );
  });
});
