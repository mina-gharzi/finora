import { expect, test, type Page } from "@playwright/test";
import { authenticate, field } from "./helpers";

/** Today as a Gregorian `YYYY-MM-DD` day, in UTC — the server's convention. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Creates a cash account with a given name and opening balance. */
async function createAccount(
  page: Page,
  name: string,
  openingBalance: number,
): Promise<void> {
  await page.goto("/accounts");
  await field(page, "name").fill(name);
  await field(page, "openingBalance").fill(String(openingBalance));
  await page.getByRole("button", { name: "افزودن حساب" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}

/**
 * Full account-lifecycle journey in a single registration (the auth rate limit
 * is 20 registrations/hour per IP, and the rest of the suite already spends
 * 18 — see the Stage 15 notes). Covers archiving, the all-archived transaction
 * guard, historical visibility, and unarchiving.
 */
test.describe("account lifecycle", () => {
  test("archives and unarchives while keeping history and balances intact", async ({
    page,
  }) => {
    await authenticate(page);

    // 1. Create an account with an opening balance; current == opening.
    await createAccount(page, "کیف پول تست", 100000);
    await expect(page.getByText(/موجودی فعلی: 100,000 تومان/).first()).toBeVisible();
    await expect(page.getByText(/موجودی اولیه: 100,000 تومان/).first()).toBeVisible();

    // 2. Record an expense against it (it is the only active account, so the
    //    form preselects it).
    await page.goto("/transactions/new");
    await field(page, "amount").fill("25000");
    await field(page, "occurredOn").fill(todayIso());
    await page.getByRole("button", { name: "ثبت تراکنش" }).click();
    await expect(page.getByText("تراکنش با موفقیت ثبت شد.")).toBeVisible();

    // 3. The current balance reflects the expense; the opening one does not.
    await page.goto("/accounts");
    await expect(page.getByText(/موجودی فعلی: 75,000 تومان/).first()).toBeVisible();
    await expect(page.getByText(/موجودی اولیه: 100,000 تومان/).first()).toBeVisible();

    // 4. Archive it — a two-step, reversible confirmation.
    await page
      .getByRole("button", { name: "بایگانی حساب کیف پول تست" })
      .click();
    await page.getByRole("button", { name: "تأیید بایگانی" }).click();

    await expect(page.getByText("بایگانی‌شده").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "خروج از بایگانی حساب کیف پول تست" }),
    ).toBeVisible();

    // 5. With every account archived, new transactions are blocked with a
    //    dedicated, non-misleading message.
    await page.goto("/transactions/new");
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "همه حساب‌های شما بایگانی شده‌اند",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ثبت تراکنش" }),
    ).toHaveCount(0);

    // 6. The archived account's history is intact and clearly marked.
    await page.goto("/transactions");
    const table = page.getByRole("table", { name: "فهرست تراکنش‌ها" });
    await expect(table.getByText("25,000 تومان")).toBeVisible();
    await expect(table.getByText("کیف پول تست")).toBeVisible();
    await expect(table.getByText("بایگانی‌شده")).toBeVisible();

    const accountFilter = page.getByLabel("حساب");
    await expect(
      accountFilter.getByRole("option", {
        name: "کیف پول تست (بایگانی‌شده)",
      }),
    ).toHaveCount(1);

    // 7. Editing still works because the transaction keeps its own (archived)
    //    account; the option is offered and labelled as archived.
    await page.getByRole("link", { name: "ویرایش تراکنش" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "ویرایش تراکنش" }),
    ).toBeVisible();
    await expect(
      page
        .locator('select[name="accountId"]:visible')
        .getByRole("option", { name: "کیف پول تست (بایگانی‌شده)" }),
    ).toHaveCount(1);

    // 8. Unarchive restores eligibility in one click.
    await page.goto("/accounts");
    await page
      .getByRole("button", { name: "خروج از بایگانی حساب کیف پول تست" })
      .click();
    await expect(
      page.getByRole("button", { name: "بایگانی حساب کیف پول تست" }),
    ).toBeVisible();
    await expect(page.getByText("بایگانی‌شده")).toHaveCount(0);

    await page.goto("/transactions/new");
    await expect(
      page.getByRole("button", { name: "ثبت تراکنش" }),
    ).toBeVisible();
  });
});
