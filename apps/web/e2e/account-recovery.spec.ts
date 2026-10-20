import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  INVALID_TOKEN_MESSAGE,
  PASSWORD_RESET_DONE_MESSAGE,
} from "../src/lib/account-recovery";

import { markEmailUnverified, mintAuthToken } from "./db";
import { field, makeCredentials, registerUser } from "./helpers";

/** A well-formed token (43-char base64url) that was never issued. */
const FORGED_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Same shape the server issues: 32 random bytes, base64url. */
function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await field(page, "email").fill(email);
  await field(page, "password").fill(password);
  await page.getByRole("button", { name: "ورود" }).click();
}

test.describe("password recovery", () => {
  test("answers an unknown address with the generic sent message", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await field(page, "email").fill("ghost@example.com");
    await page.getByRole("button", { name: "ارسال پیوند بازیابی" }).click();
    await expect(page.getByRole("status").or(page.getByRole("alert")).first()).toBeVisible();
  });

  test("reset link changes the password, kills old sessions and is single-use", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    const rawToken = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "password_reset",
      rawToken,
    });

    // GET never consumes: the form renders for the link recipient (and for
    // any scanner that prefetches it).
    await page.goto(`/reset-password?token=${rawToken}`);
    await expect(page.getByRole("button", { name: "تغییر گذرواژه" })).toBeVisible();

    const newPassword = "BrandNewPass1";
    await field(page, "password").fill(newPassword);
    await field(page, "confirm").fill(newPassword);
    await page.getByRole("button", { name: "تغییر گذرواژه" }).click();
    await expect(page.getByText(PASSWORD_RESET_DONE_MESSAGE)).toBeVisible();

    // Every pre-reset session is invalidated: the still-held cookie no
    // longer authenticates.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    // The old password is dead.
    await login(page, credentials.email, credentials.password);
    await expect(page.getByText("نادرست")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // The new password works.
    await login(page, credentials.email, newPassword);
    await expect(page).toHaveURL("/");

    // The token was spent; it cannot be replayed.
    await page.goto(`/reset-password?token=${rawToken}`);
    await field(page, "password").fill("AnotherPass1");
    await field(page, "confirm").fill("AnotherPass1");
    await page.getByRole("button", { name: "تغییر گذرواژه" }).click();
    await expect(page.getByText(INVALID_TOKEN_MESSAGE)).toBeVisible();
  });

  test("rejects expired, forged and wrong-purpose reset tokens identically", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    const expired = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "password_reset",
      rawToken: expired,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const verifyToken = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "email_verify",
      rawToken: verifyToken,
    });

    for (const token of [expired, FORGED_TOKEN, verifyToken]) {
      await page.goto(`/reset-password?token=${token}`);
      await field(page, "password").fill("WhateverPass1");
      await field(page, "confirm").fill("WhateverPass1");
      await page.getByRole("button", { name: "تغییر گذرواژه" }).click();
      await expect(page.getByText(INVALID_TOKEN_MESSAGE)).toBeVisible();
      // Still on the page: no password change happened.
      await expect(page).toHaveURL(/\/reset-password/);
    }
  });
});

test.describe("email verification", () => {
  test("rejects expired, forged and wrong-purpose verification tokens identically", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    await markEmailUnverified(credentials.email);

    const expired = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "email_verify",
      rawToken: expired,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resetToken = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "password_reset",
      rawToken: resetToken,
    });

    for (const token of [expired, FORGED_TOKEN, resetToken]) {
      await page.goto(`/verify-email?token=${token}`);
      await page.getByRole("button", { name: "تأیید ایمیل" }).click();
      await expect(page.getByText(INVALID_TOKEN_MESSAGE)).toBeVisible();
    }

    // Still unverified after every rejection.
    await page.goto("/categories");
    await expect(
      page.getByText("ایمیل شما تأیید نشده است"),
    ).toBeVisible();
  });
});
