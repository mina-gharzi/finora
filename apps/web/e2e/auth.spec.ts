import { expect, test } from "./fixtures";
import { field, makeCredentials, registerUser } from "./helpers";

test.describe("authentication", () => {
  test("redirects unauthenticated visitors from the app to the login page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { level: 1, name: "ورود به فینورا" }),
    ).toBeVisible();
  });

  test("shows server-side validation errors on an invalid registration", async ({
    page,
  }) => {
    await page.goto("/register");

    await field(page, "name").fill("ا");
    await field(page, "email").fill("not-an-email");
    await field(page, "password").fill("short");
    await page.getByRole("button", { name: "ثبت‌نام" }).click();

    await expect(page.getByText("ایمیل معتبر نیست.")).toBeVisible();
    await expect(
      page.getByText("گذرواژه باید حداقل ۸ نویسه باشد."),
    ).toBeVisible();
    await expect(page).toHaveURL("/register");
  });

  test("rejects an unknown email with a generic message", async ({ page }) => {
    const credentials = makeCredentials();

    await page.goto("/login");
    await field(page, "email").fill(credentials.email);
    await field(page, "password").fill(credentials.password);
    await page.getByRole("button", { name: "ورود" }).click();

    await expect(
      page.getByText("ایمیل یا گذرواژه نادرست است."),
    ).toBeVisible();
  });

  test("rejects a wrong password for an existing account", async ({ page }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    await field(page, "email").fill(credentials.email);
    await field(page, "password").fill("WrongPassword123");
    await page.getByRole("button", { name: "ورود" }).click();

    await expect(
      page.getByText("ایمیل یا گذرواژه نادرست است."),
    ).toBeVisible();
  });

  test("registers a new user, lands on the dashboard and logs out", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    await expect(
      page.getByRole("heading", { level: 1, name: "داشبورد" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    // The session is gone: the app route is protected again.
    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });

  test("lets a registered user log back in with their password", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    await field(page, "email").fill(credentials.email);
    await field(page, "password").fill(credentials.password);
    await page.getByRole("button", { name: "ورود" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "داشبورد" }),
    ).toBeVisible();
  });

  test("prevents registering the same email twice", async ({ page }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    await page.goto("/register");
    await field(page, "name").fill(credentials.name);
    await field(page, "email").fill(credentials.email);
    await field(page, "password").fill(credentials.password);
    await page.getByRole("button", { name: "ثبت‌نام" }).click();

    await expect(
      page.getByText("این ایمیل قبلاً ثبت شده است."),
    ).toBeVisible();
  });

  test("redirects an authenticated user away from the login page", async ({
    page,
  }) => {
    await registerUser(page, makeCredentials());

    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});
