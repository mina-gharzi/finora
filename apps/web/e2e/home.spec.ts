import { expect, test } from "@playwright/test";
import { authenticate } from "./helpers";

// The dashboard is protected, so sign in before each shell/palette assertion.
test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test("home page renders the Persian application shell", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", "fa");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("data-theme", "light");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "داشبورد" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "ناوبری اصلی" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "داشبورد" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("main")).toHaveCSS("direction", "rtl");
});

test("light theme exposes the approved brand palette through semantic tokens", async ({
  page,
}) => {
  await page.goto("/");

  // Off White background.
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 245, 247)",
  );

  // Burgundy for brand emphasis and the active navigation item.
  await expect(page.locator("aside").getByText("فینورا")).toHaveCSS(
    "color",
    "rgb(75, 20, 38)",
  );
  await expect(page.getByRole("link", { name: "داشبورد" })).toHaveCSS(
    "color",
    "rgb(75, 20, 38)",
  );

  // Champagne Gold accent, used only for the decorative logo mark.
  await expect(
    page.locator('aside span[aria-hidden="true"]').first(),
  ).toHaveCSS("background-color", "rgb(184, 138, 90)");
});

test("skip link is the first control and moves to the main content", async ({
  page,
}) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "پرش به محتوای اصلی" });
  await expect(skipLink).toBeFocused();

  await skipLink.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
});

test("theme toggle applies and survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const toggle = page.getByRole("button", { name: "حالت تیره" });
  await toggle.click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "حالت تیره" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("dark theme uses the Near Black foundation with a lightened burgundy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(245, 245, 247)",
  );

  const bodyBackground = () =>
    page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundColor);

  const light = await bodyBackground();
  await page.getByRole("button", { name: "حالت تیره" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  expect(await bodyBackground()).not.toBe(light);

  // Near Black foundation.
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(25, 25, 25)",
  );

  // Burgundy is lightened in the dark theme so it stays visible on Near Black.
  await expect(page.getByRole("link", { name: "داشبورد" })).toHaveCSS(
    "color",
    "rgb(201, 139, 164)",
  );
});

test("mobile navigation opens with the menu button and closes on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator("aside")).toBeHidden();

  const panel = page.locator("#mobile-nav");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "باز کردن منو" }).click();

  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "بستن منو" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(
    page.getByRole("navigation", { name: "ناوبری موبایل" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(
    page.getByRole("button", { name: "باز کردن منو" }),
  ).toHaveAttribute("aria-expanded", "false");
});
