import { expect, test, type Page } from "@playwright/test";
import { field, makeCredentials, registerUser } from "./helpers";

async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await field(page, "email").fill(email);
  await field(page, "password").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

async function submitChange(
  page: Page,
  current: string,
  next: string,
  confirm = next,
): Promise<void> {
  await field(page, "current").fill(current);
  await field(page, "password").fill(next);
  await field(page, "confirm").fill(confirm);
  await page.getByRole("button", { name: "تغییر گذرواژه" }).click();
}

test.describe("password change", () => {
  test.beforeEach(async ({ context }) => {
    // Isolate per-test IP so process-local limiters don't cross-contaminate.
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.103.${(Date.now() % 250) + 1}`,
    });
  });

  test("changes the password from settings, signs out, and requires the new password", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    // Discoverable from the application navigation.
    const settingsLink = page.locator('a[href="/settings"]:visible');
    await expect(settingsLink).toBeVisible();
    await settingsLink.click();
    await expect(page).toHaveURL("/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "تنظیمات" }),
    ).toBeVisible();

    await submitChange(page, credentials.password, "NewPassword456");

    // The action ends this browser's session and points at the login page
    // with an explicit confirmation message.
    await expect(page).toHaveURL("/login?passwordChanged=1");
    await expect(
      page.getByText("گذرواژه شما با موفقیت تغییر کرد"),
    ).toBeVisible();

    // The old password is dead.
    await login(page, credentials.email, credentials.password);
    await expect(
      page.getByText("ایمیل یا گذرواژه نادرست است."),
    ).toBeVisible();

    // The new password works.
    await login(page, credentials.email, "NewPassword456");
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "داشبورد" }),
    ).toBeVisible();
  });

  test("keeps the session and the stored password when the current password is wrong", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    await page.goto("/settings");
    await submitChange(page, "WrongCurrent9", "NewPassword456");

    await expect(page.getByText("گذرواژه فعلی نادرست است.")).toBeVisible();
    await expect(page).toHaveURL("/settings");

    // Still signed in after the rejection...
    await page.reload();
    await expect(page).toHaveURL("/settings");

    // ...and the stored password never changed.
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");
    await login(page, credentials.email, credentials.password);
    await expect(page).toHaveURL("/");
  });

  test("rejects a mismatched confirmation with a Persian field error", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    await page.goto("/settings");
    await submitChange(page, credentials.password, "NewPassword456", "Different1");

    await expect(
      page.getByText("گذرواژه و تکرار آن یکسان نیستند."),
    ).toBeVisible();
    await expect(page).toHaveURL("/settings");
  });

  test("revokes the pre-change session everywhere; only the new password restores access", async ({
    page,
    context,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    // This browser now holds a session issued before the change.
    const staleCookies = await context.cookies();

    await page.goto("/settings");
    await submitChange(page, credentials.password, "NewPassword456");
    await expect(page).toHaveURL("/login?passwordChanged=1");

    // Re-install the pre-change cookie: its HMAC is still valid, so only
    // the session-invalidation watermark can keep it out.
    await context.addCookies(staleCookies);
    await page.goto("/");
    // The DAL rejects it and the proxy lets it settle on the marked login
    // page — a stable destination (no redirect loop) with a clear notice.
    await expect(page).toHaveURL("/login?session=expired");
    await expect(
      page.getByText("نشست شما به پایان رسیده است"),
    ).toBeVisible();

    // A protected route stays out of reach too.
    await page.goto("/reports");
    await expect(page).toHaveURL("/login?session=expired");

    // Recovery: sign in from this state with the new password.
    await field(page, "email").fill(credentials.email);
    await field(page, "password").fill("NewPassword456");
    await page.getByRole("button", { name: "ورود" }).click();
    await expect(page).toHaveURL("/");
  });
});
