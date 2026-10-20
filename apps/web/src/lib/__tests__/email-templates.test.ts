/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildEmailChangeEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  emailChangeLink,
  escapeHtml,
  passwordResetLink,
  verificationLink,
} from "@/lib/email/templates";

const BASE = "https://finora.example.com";
const TOKEN = "raw-token-value";

describe("escapeHtml", () => {
  it("neutralizes markup-significant characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
    );
  });
});

describe("recovery links", () => {
  it("places the token in the query string of the right path", () => {
    expect(verificationLink(BASE, TOKEN)).toBe(
      `https://finora.example.com/verify-email?token=${TOKEN}`,
    );
    expect(passwordResetLink(BASE, TOKEN)).toBe(
      `https://finora.example.com/reset-password?token=${TOKEN}`,
    );
  });

  it("tolerates a trailing slash on the base url", () => {
    expect(verificationLink("https://x.example/", TOKEN)).toBe(
      `https://x.example/verify-email?token=${TOKEN}`,
    );
  });
});

describe("verification email", () => {
  const email = buildVerificationEmail({
    to: "user@example.com",
    name: "علی",
    baseUrl: BASE,
    rawToken: TOKEN,
  });

  it("keeps the raw token out of the subject (mail previews, notifications)", () => {
    expect(email.subject).not.toContain(TOKEN);
  });

  it("includes the token link in both text and html parts", () => {
    const link = verificationLink(BASE, TOKEN);
    expect(email.text).toContain(link);
    expect(email.html).toContain(link);
  });

  it("addresses the submitted recipient", () => {
    expect(email.to).toBe("user@example.com");
  });

  it("escapes a hostile display name inside the html part only", () => {
    const hostile = buildVerificationEmail({
      to: "user@example.com",
      name: '<script>alert("x")</script>',
      baseUrl: BASE,
      rawToken: TOKEN,
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
    // The text part is plain text and must keep the original characters.
    expect(hostile.text).toContain('<script>alert("x")</script>');
  });
});

describe("password reset email", () => {
  const email = buildPasswordResetEmail({
    to: "user@example.com",
    name: "علی",
    baseUrl: BASE,
    rawToken: TOKEN,
  });

  it("keeps the raw token out of the subject", () => {
    expect(email.subject).not.toContain(TOKEN);
  });

  it("links to the reset page with the token", () => {
    const link = passwordResetLink(BASE, TOKEN);
    expect(email.text).toContain(link);
    expect(email.html).toContain(link);
  });

  it("states that the password is unchanged when the request was not the user's", () => {
    expect(email.text).toContain("گذرواژه شما تغییری نکرده است");
  });
});

describe("change-email link", () => {
  it("places the token in the query string of the change-email path", () => {
    expect(emailChangeLink(BASE, TOKEN)).toBe(
      `https://finora.example.com/change-email?token=${TOKEN}`,
    );
  });
});

describe("email change email", () => {
  const email = buildEmailChangeEmail({
    to: "new@example.com",
    name: "علی",
    baseUrl: BASE,
    rawToken: TOKEN,
  });

  it("is delivered to the new address", () => {
    expect(email.to).toBe("new@example.com");
  });

  it("keeps the raw token out of the subject", () => {
    expect(email.subject).not.toContain(TOKEN);
  });

  it("links to the change-email page with the token in both parts", () => {
    const link = emailChangeLink(BASE, TOKEN);
    expect(email.text).toContain(link);
    expect(email.html).toContain(link);
  });

  it("states explicitly that the link changes the account's email address", () => {
    expect(email.text).toContain("ایمیل مرتبط با حساب فینورا شما");
    expect(email.html).toContain("ایمیل مرتبط با حساب فینورا شما");
  });

  it("tells an unintended recipient the account email did not change", () => {
    expect(email.text).toContain("ایمیل حساب شما تغییری نکرده است");
  });

  it("escapes a hostile display name inside the html part only", () => {
    const hostile = buildEmailChangeEmail({
      to: "new@example.com",
      name: '<script>alert("x")</script>',
      baseUrl: BASE,
      rawToken: TOKEN,
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
    expect(hostile.text).toContain('<script>alert("x")</script>');
  });
});
