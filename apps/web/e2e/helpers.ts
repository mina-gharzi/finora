import { expect, type Locator, type Page } from "@playwright/test";
import { markEmailVerified } from "./db";

export interface TestCredentials {
  name: string;
  email: string;
  password: string;
}

/**
 * Resolves a text field in the *visible* form.
 *
 * Next 16 keeps a prefetched route mounted in a hidden (`display:none`) React
 * Activity tree, so `getByLabel` can match a hidden duplicate input. Scoping to
 * `:visible` targets the interactive form.
 */
export function field(page: Page, name: string): Locator {
  return page.locator(`input[name="${name}"]:visible`);
}

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

export function makeCredentials(
  overrides: Partial<TestCredentials> = {},
): TestCredentials {
  return {
    name: "کاربر آزمایشی",
    email: uniqueEmail(),
    password: "Password123",
    ...overrides,
  };
}

/** Registers a brand-new account through the UI and waits for the dashboard. */
export async function registerUser(
  page: Page,
  credentials: TestCredentials,
): Promise<void> {
  await page.goto("/register");
  await field(page, "name").fill(credentials.name);
  await field(page, "email").fill(credentials.email);
  await field(page, "password").fill(credentials.password);
  await page.getByRole("button", { name: "ثبت‌نام" }).click();
  await expect(page).toHaveURL("/dashboard");
  // Financial mutations require a verified email; tests have no inbox, so
  // apply the verification end state the emailed link would produce.
  await markEmailVerified(credentials.email);
}

/** Registers a throwaway account and leaves the browser signed in. */
export async function authenticate(page: Page): Promise<TestCredentials> {
  const credentials = makeCredentials();
  await registerUser(page, credentials);
  return credentials;
}
