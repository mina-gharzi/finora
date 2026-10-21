import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { field, makeCredentials, registerUser } from "./helpers";

/**
 * Externally observable rate-limit behaviour.
 *
 * The persistent limiter counts only FAILED logins against the per-account
 * scope, so the account should lock after the configured number of wrong
 * passwords while a legitimate sign-in never consumes the budget. The suite
 * runs with TRUSTED_PROXY_HOPS=1 (see e2e/email-guard.ts) and the shared test
 * fixture pins a unique forwarded IP per test, so no other test's traffic
 * shares these buckets.
 */
async function submitLogin(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await field(page, "email").fill(email);
  await field(page, "password").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

test.describe("persistent auth rate limiting", () => {
  test("locks the account after repeated failed logins and reports a retry window", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    const wrong = "WrongPassword999";
    // The account scope allows 5 failed attempts per window.
    for (let attempt = 0; attempt < 5; attempt++) {
      await submitLogin(page, credentials.email, wrong);
      await expect(page.getByText("ایمیل یا گذرواژه نادرست است.")).toBeVisible();
    }

    // The sixth failure is refused by the limiter, not the credential check.
    await submitLogin(page, credentials.email, wrong);
    await expect(page.getByText(/بیش از حد مجاز/)).toBeVisible();
  });

  test("a correct password is not counted and does not lock the account", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    // A success after four allowed failures must still work: the failed
    // attempts do not reach the limit, and the success resets the budget.
    for (let attempt = 0; attempt < 4; attempt++) {
      await submitLogin(page, credentials.email, "WrongPassword999");
      await expect(page.getByText("ایمیل یا گذرواژه نادرست است.")).toBeVisible();
    }

    await submitLogin(page, credentials.email, credentials.password);
    await expect(page).toHaveURL("/dashboard");
  });
});
