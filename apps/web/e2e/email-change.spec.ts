import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  EMAIL_CHANGE_ALREADY_USED_MESSAGE,
  EMAIL_CHANGE_SENT_MESSAGE,
  EMAIL_CHANGED_MESSAGE,
  EMAIL_DELIVERY_UNAVAILABLE_MESSAGE,
  INVALID_TOKEN_MESSAGE,
} from "../src/lib/account-recovery";
import { mintAuthToken } from "./db";
import { field, makeCredentials, registerUser, uniqueEmail } from "./helpers";

/** A well-formed token (43-char base64url) that was never issued. */
const FORGED_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Same shape the server issues: 32 random bytes, base64url. */
function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

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

async function requestChange(page: Page, newEmail: string): Promise<void> {
  await field(page, "email").fill(newEmail);
  await page.getByRole("button", { name: "ارسال پیوند تأیید" }).click();
}

test.describe("email change", () => {
  test.beforeEach(async ({ context }) => {
    // Isolate per-test IP so process-local limiters don't cross-contaminate.
    await context.setExtraHTTPHeaders({
      "x-forwarded-for": `198.51.102.${(Date.now() % 250) + 1}`,
    });
  });

  test("validates the address and never claims a send that cannot happen", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    await page.goto("/settings");

    // Malformed address: field-level error, nothing else happens.
    await requestChange(page, "not-an-email");
    await expect(page.getByText("ایمیل معتبر نیست.")).toBeVisible();
    await expect(page).toHaveURL("/settings");

    // The current address cannot be "changed" to itself.
    await requestChange(page, credentials.email);
    await expect(page.getByText("این ایمیل، ایمیل فعلی شماست.")).toBeVisible();

    // Email delivery is disabled in this suite, so the honest answer must
    // come back — no success claim, no link left behind.
    await requestChange(page, uniqueEmail("target"));
    await expect(page.getByText(EMAIL_DELIVERY_UNAVAILABLE_MESSAGE)).toBeVisible();
    await expect(page.getByText(EMAIL_CHANGE_SENT_MESSAGE)).not.toBeVisible();
    await expect(page).toHaveURL("/settings");

    // Still signed in, and the stored email never moved: the original
    // address still signs in.
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");
    await login(page, credentials.email, credentials.password);
    await expect(page).toHaveURL("/");
  });

  test("names a duplicate address to the signed-in owner, without claiming delivery", async ({
    page,
  }) => {
    const first = makeCredentials();
    await registerUser(page, first);
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL("/login");

    const second = makeCredentials();
    await registerUser(page, second);
    await page.goto("/settings");

    await requestChange(page, first.email);
    await expect(page.getByText("این ایمیل قبلاً ثبت شده است.")).toBeVisible();
    await expect(page.getByText(EMAIL_CHANGE_SENT_MESSAGE)).not.toBeVisible();
    await expect(page).toHaveURL("/settings");
  });

  test("confirmation link applies the address, kills sessions, and is single-use", async ({
    page,
    context,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);
    // This browser holds a session issued before the change.
    const staleCookies = await context.cookies();

    const newEmail = uniqueEmail("changed");
    const rawToken = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "email_change",
      rawToken,
      targetEmail: newEmail,
    });

    // GET never consumes: the confirm page renders for the recipient (and
    // for any scanner that prefetches it).
    await page.goto(`/change-email?token=${rawToken}`);
    await expect(
      page.getByRole("button", { name: "تأیید تغییر ایمیل" }),
    ).toBeVisible();
    await expect(page.getByText(newEmail)).toBeVisible();

    await page.getByRole("button", { name: "تأیید تغییر ایمیل" }).click();
    await expect(page.getByText(EMAIL_CHANGED_MESSAGE)).toBeVisible();

    // The app's own cookie was cleared with the change: anonymous now.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    // Re-install the pre-change cookie: its HMAC is still valid, so only
    // the session-invalidation watermark can keep it out.
    await context.addCookies(staleCookies);
    await page.goto("/");
    await expect(page).toHaveURL("/login?session=expired");

    // The old address is dead for login...
    await login(page, credentials.email, credentials.password);
    await expect(page.getByText("نادرست")).toBeVisible();

    // ...and the new address works (verification carried over).
    await login(page, newEmail, credentials.password);
    await expect(page).toHaveURL("/");

    // The link was spent: the URL now renders the already-used answer and
    // offers no confirm button.
    await page.goto(`/change-email?token=${rawToken}`);
    await expect(page.getByText(EMAIL_CHANGE_ALREADY_USED_MESSAGE)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "تأیید تغییر ایمیل" }),
    ).toHaveCount(0);
  });

  test("renders missing, expired, forged and wrong-purpose links identically", async ({
    page,
  }) => {
    const credentials = makeCredentials();
    await registerUser(page, credentials);

    const expired = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "email_change",
      rawToken: expired,
      targetEmail: uniqueEmail("target"),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const resetToken = randomToken();
    await mintAuthToken({
      email: credentials.email,
      purpose: "password_reset",
      rawToken: resetToken,
    });

    for (const token of ["", expired, FORGED_TOKEN, resetToken]) {
      await page.goto(`/change-email${token ? `?token=${token}` : ""}`);
      await expect(page.getByText(INVALID_TOKEN_MESSAGE)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "تأیید تغییر ایمیل" }),
      ).toHaveCount(0);
    }
  });
});
