import { expect, test } from "./fixtures";
import { authenticate } from "./helpers";

test.describe("default categories", () => {
  test("seeds the suggested categories once and then hides the button", async ({
    page,
  }) => {
    await authenticate(page);

    await page.goto("/categories");

    const seedButton = page.getByRole("button", {
      name: "افزودن دسته‌بندی‌های پیشنهادی",
      exact: true,
    });
    await expect(seedButton).toBeVisible();
    await seedButton.click();

    // The success message lives inside the empty state, which unmounts when the
    // revalidated page renders the new categories — so assert the visible
    // result (the per-kind counts) instead.
    await expect(page.getByRole("tab", { name: "هزینه 10" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "درآمد 5" })).toBeVisible();

    // The starter expense category is listed immediately.
    await expect(page.getByText("خوراک و رستوران").first()).toBeVisible();

    // Switch to the income tab to see a starter income category.
    await page.getByRole("tab", { name: /درآمد/ }).click();
    await expect(page.getByText("حقوق").first()).toBeVisible();

    // The suggestion is only offered while the user has no categories.
    await expect(seedButton).toHaveCount(0);

    // Reloading without clicking must not bring the button back.
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "افزودن دسته‌بندی‌های پیشنهادی",
        exact: true,
      }),
    ).toHaveCount(0);
  });
});
