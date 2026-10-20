/**
 * @vitest-environment node
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  isProduction: () => process.env.NODE_ENV === "production",
  getAppUrl: () => "http://127.0.0.1:3000",
}));

import type { OutboundEmail } from "@/lib/email/templates";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "@/lib/email/templates";

/** What the adapter hands to the provider's `emails.send`. */
type SendPayload = OutboundEmail & { from: string };

/**
 * Shared state for the mocked `resend` module. Hoisted because `vi.mock`
 * factories execute before this file's module body.
 */
const resendMock = vi.hoisted(() => ({
  createdKeys: [] as string[],
  sendCalls: [] as SendPayload[],
  /** When set, `emails.send` returns this response instead of a success. */
  response: null as unknown,
  /** When set, `emails.send` throws this error. */
  thrown: null as unknown,
  reset(): void {
    this.createdKeys.length = 0;
    this.sendCalls.length = 0;
    this.response = null;
    this.thrown = null;
  },
}));

/**
 * Network/provider interactions are always mocked — automated tests must
 * never call the Resend API or send real email.
 */
vi.mock("resend", () => ({
  Resend: class MockResend {
    readonly emails: { send: (payload: SendPayload) => Promise<unknown> };

    constructor(apiKey: string) {
      resendMock.createdKeys.push(apiKey);
      this.emails = {
        send: async (payload: SendPayload) => {
          resendMock.sendCalls.push(payload);
          if (resendMock.thrown) throw resendMock.thrown;
          if (resendMock.response) return resendMock.response;
          return { data: { id: "email_test_id" }, error: null, headers: {} };
        },
      };
    }
  },
}));

import {
  EmailDeliveryUnavailableError,
  EmailProviderError,
  isEmailDeliveryAvailable,
  resolveEmailAdapter,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/adapter";

const saved: Record<string, string | undefined> = {};
const KEYS = [
  "NODE_ENV",
  "EMAIL_OUTBOX_DIR",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_PROVIDER",
];

/** Never-real test credentials; asserted NOT to appear in any log line. */
const API_KEY = "re_test_key_1234567890";
const FROM = "Finora <no-reply@example.com>";

function stubEnv(key: string, value: string | undefined): void {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** Production with complete Resend configuration (unless a test overrides). */
function stubProductionResend(): void {
  stubEnv("NODE_ENV", "production");
  stubEnv("RESEND_API_KEY", API_KEY);
  stubEnv("EMAIL_FROM", FROM);
  stubEnv("EMAIL_OUTBOX_DIR", undefined);
}

/** Development with the explicit opt-in flag and complete configuration. */
function stubDevelopmentResendOptIn(): void {
  stubEnv("NODE_ENV", "development");
  stubEnv("RESEND_API_KEY", API_KEY);
  stubEnv("EMAIL_FROM", FROM);
  stubEnv("EMAIL_PROVIDER", "resend");
  stubEnv("EMAIL_OUTBOX_DIR", undefined);
}

beforeEach(() => {
  resendMock.reset();
  // A developer's ambient environment must never influence selection here:
  // every test starts with the Resend variables and the dev opt-in flag absent.
  stubEnv("RESEND_API_KEY", undefined);
  stubEnv("EMAIL_FROM", undefined);
  stubEnv("EMAIL_PROVIDER", undefined);
});

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete saved[key];
  }
  vi.restoreAllMocks();
});

describe("production adapter selection", () => {
  it("selects the Resend adapter when both variables are present", () => {
    stubProductionResend();
    expect(resolveEmailAdapter().name).toBe("resend");
    expect(isEmailDeliveryAvailable()).toBe(true);
  });

  it("stays unconfigured when only RESEND_API_KEY is set", () => {
    stubProductionResend();
    stubEnv("EMAIL_FROM", undefined);
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("stays unconfigured when only EMAIL_FROM is set", () => {
    stubProductionResend();
    stubEnv("RESEND_API_KEY", undefined);
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("never falls back to the console adapter", () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("never falls back to the file-outbox adapter, even when configured", () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("EMAIL_OUTBOX_DIR", "C:\\temp\\some-outbox");
    stubEnv("RESEND_API_KEY", undefined);
    stubEnv("EMAIL_FROM", undefined);
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("ignores the outbox directory in production when Resend is configured", () => {
    stubProductionResend();
    stubEnv("EMAIL_OUTBOX_DIR", "C:\\temp\\some-outbox");
    expect(resolveEmailAdapter().name).toBe("resend");
    expect(isEmailDeliveryAvailable()).toBe(true);
  });

  it("fails sends with a typed error instead of dropping them", async () => {
    stubEnv("NODE_ENV", "production");
    await expect(
      sendVerificationEmail({
        to: "user@example.com",
        name: "کاربر",
        rawToken: "tok",
      }),
    ).resolves.toBe("unavailable");
  });
});

describe("production Resend sending", () => {
  it("sends the verification payload with the configured key and sender", async () => {
    stubProductionResend();
    const rawToken = "verify-raw-token-123";

    const outcome = await sendVerificationEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken,
    });

    expect(outcome).toBe("sent");
    expect(resendMock.createdKeys).toEqual([API_KEY]);
    expect(resendMock.sendCalls).toHaveLength(1);

    const payload = resendMock.sendCalls[0];
    const expected = buildVerificationEmail({
      to: "user@example.com",
      name: "کاربر",
      baseUrl: "http://127.0.0.1:3000",
      rawToken,
    });
    expect(payload.from).toBe(FROM);
    expect(payload.to).toBe("user@example.com");
    expect(payload.subject).toBe(expected.subject);
    expect(payload.html).toBe(expected.html);
    expect(payload.text).toBe(expected.text);
    expect(payload.text).toContain(
      `http://127.0.0.1:3000/verify-email?token=${rawToken}`,
    );
  });

  it("sends the password-reset payload with its own link and subject", async () => {
    stubProductionResend();
    const rawToken = "reset-raw-token-123";

    const outcome = await sendPasswordResetEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken,
    });

    expect(outcome).toBe("sent");
    expect(resendMock.sendCalls).toHaveLength(1);

    const payload = resendMock.sendCalls[0];
    const expected = buildPasswordResetEmail({
      to: "user@example.com",
      name: "کاربر",
      baseUrl: "http://127.0.0.1:3000",
      rawToken,
    });
    expect(payload.from).toBe(FROM);
    expect(payload.subject).toBe(expected.subject);
    expect(payload.html).toBe(expected.html);
    expect(payload.text).toBe(expected.text);
    expect(payload.text).toContain(
      `http://127.0.0.1:3000/reset-password?token=${rawToken}`,
    );
    // Purpose separation: a reset message never carries the verify link.
    expect(payload.text).not.toContain("/verify-email");
    expect(payload.html).not.toContain("/verify-email");
  });
});

describe("provider failures stay safe", () => {
  it("maps a structured provider error to 'unavailable' and logs no key, token, recipient or provider message", async () => {
    stubProductionResend();
    resendMock.response = {
      data: null,
      error: {
        name: "invalid_api_key",
        statusCode: 401,
        message: `Invalid API key ${API_KEY} for recipient victim@example.com`,
      },
      headers: {},
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendVerificationEmail({
      to: "victim@example.com",
      name: "کاربر",
      rawToken: "SUPER_SECRET_RAW_TOKEN",
    });

    expect(outcome).toBe("unavailable");
    expect(errorSpy).toHaveBeenCalled();

    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    // The stable machine code survives for operators...
    expect(logged).toContain("invalid_api_key");
    // ...but nothing sensitive does.
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("SUPER_SECRET_RAW_TOKEN");
    expect(logged).not.toContain("victim@example.com");
    expect(logged).not.toContain("Invalid API key");
  });

  it("maps a thrown transport error to 'unavailable' without leaking its message", async () => {
    stubProductionResend();
    resendMock.thrown = new Error(
      `connect ECONNREFUSED api.resend.com with key ${API_KEY}`,
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendPasswordResetEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken: "reset-secret-token",
    });

    expect(outcome).toBe("unavailable");
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("email provider send failed (Error)");
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("ECONNREFUSED");
    expect(logged).not.toContain("reset-secret-token");
    expect(logged).not.toContain("user@example.com");
  });

  it("redacts token links and addresses from unexpected error details", async () => {
    stubEnv("NODE_ENV", "test");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    vi.spyOn(resolveEmailAdapter(), "send").mockRejectedValue(
      new Error(
        "post https://app.example.com/verify-email?token=live-token-abc failed for admin@example.com",
      ),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendVerificationEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken: "unused",
    });

    expect(outcome).toBe("unavailable");
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("[redacted]");
    expect(logged).toContain("[redacted-email]");
    expect(logged).not.toContain("live-token-abc");
    expect(logged).not.toContain("admin@example.com");
  });
});

describe("development adapters", () => {
  it("uses the console adapter by default", () => {
    stubEnv("NODE_ENV", "development");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    expect(resolveEmailAdapter().name).toBe("console");
    expect(isEmailDeliveryAvailable()).toBe(true);
  });

  it("writes messages to the outbox directory when configured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "finora-outbox-"));
    stubEnv("NODE_ENV", "test");
    stubEnv("EMAIL_OUTBOX_DIR", dir);
    try {
      expect(resolveEmailAdapter().name).toBe("file-outbox");

      const outcome = await sendPasswordResetEmail({
        to: "user@example.com",
        name: "کاربر",
        rawToken: "the-raw-token",
      });
      expect(outcome).toBe("sent");

      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      expect(files).toHaveLength(1);
      const body = JSON.parse(await readFile(join(dir, files[0]), "utf8"));
      expect(body.to).toBe("user@example.com");
      expect(body.text).toContain("the-raw-token");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("console adapter logs the full message including the link", async () => {
    stubEnv("NODE_ENV", "test");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const outcome = await sendVerificationEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken: "dev-token",
    });
    expect(outcome).toBe("sent");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("dev-token");
    spy.mockRestore();
  });

  it("never sends through Resend in development, even when the variables are set", () => {
    // Explicit here (cleared globally in beforeEach) to pin that the DEFAULT
    // stays console whenever EMAIL_PROVIDER=resend is absent.
    stubEnv("EMAIL_PROVIDER", undefined);
    stubEnv("NODE_ENV", "development");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    stubEnv("RESEND_API_KEY", API_KEY);
    stubEnv("EMAIL_FROM", FROM);
    expect(resolveEmailAdapter().name).toBe("console");
    expect(resendMock.createdKeys).toHaveLength(0);
  });

  it("keeps the file-outbox default in development when the flag is absent", () => {
    stubEnv("NODE_ENV", "development");
    stubEnv("EMAIL_OUTBOX_DIR", "C:\\temp\\some-outbox");
    stubEnv("RESEND_API_KEY", API_KEY);
    stubEnv("EMAIL_FROM", FROM);
    expect(resolveEmailAdapter().name).toBe("file-outbox");
    expect(resendMock.createdKeys).toHaveLength(0);
  });
});

describe("development Resend opt-in (EMAIL_PROVIDER=resend)", () => {
  it("selects the Resend adapter when the flag and a complete configuration are present", async () => {
    stubDevelopmentResendOptIn();
    expect(resolveEmailAdapter().name).toBe("resend");
    expect(isEmailDeliveryAvailable()).toBe(true);

    const outcome = await sendVerificationEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken: "dev-optin-token",
    });
    expect(outcome).toBe("sent");
    expect(resendMock.createdKeys).toEqual([API_KEY]);
    expect(resendMock.sendCalls).toHaveLength(1);
    expect(resendMock.sendCalls[0].from).toBe(FROM);
    expect(resendMock.sendCalls[0].text).toContain("dev-optin-token");
  });

  it("takes precedence over the file-outbox adapter when configured", () => {
    stubDevelopmentResendOptIn();
    stubEnv("EMAIL_OUTBOX_DIR", "C:\\temp\\some-outbox");
    expect(resolveEmailAdapter().name).toBe("resend");
    expect(isEmailDeliveryAvailable()).toBe(true);
  });

  it("falls back to the console adapter on partial configuration without loading the SDK", async () => {
    stubEnv("NODE_ENV", "development");
    stubEnv("EMAIL_PROVIDER", "resend");
    stubEnv("RESEND_API_KEY", API_KEY);
    stubEnv("EMAIL_FROM", undefined);
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    expect(resolveEmailAdapter().name).toBe("console");

    const outcome = await sendVerificationEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken: "half-configured-token",
    });
    expect(outcome).toBe("sent");
    expect(resendMock.createdKeys).toHaveLength(0);
    expect(resendMock.sendCalls).toHaveLength(0);
  });

  it("falls back to a configured file-outbox when only the sender is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "finora-outbox-"));
    stubEnv("NODE_ENV", "development");
    stubEnv("EMAIL_PROVIDER", "resend");
    stubEnv("RESEND_API_KEY", API_KEY);
    stubEnv("EMAIL_FROM", undefined);
    stubEnv("EMAIL_OUTBOX_DIR", dir);
    try {
      expect(resolveEmailAdapter().name).toBe("file-outbox");

      const outcome = await sendPasswordResetEmail({
        to: "user@example.com",
        name: "کاربر",
        rawToken: "half-configured-reset",
      });
      expect(outcome).toBe("sent");
      expect(resendMock.createdKeys).toHaveLength(0);
      expect(resendMock.sendCalls).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves the default development behaviour when the flag value is unknown", () => {
    stubEnv("NODE_ENV", "development");
    stubEnv("EMAIL_PROVIDER", "smtp");
    stubEnv("RESEND_API_KEY", API_KEY);
    stubEnv("EMAIL_FROM", FROM);
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    expect(resolveEmailAdapter().name).toBe("console");
    expect(resendMock.createdKeys).toHaveLength(0);
  });

  it("stays unconfigured in production when the flag is set but configuration is missing", () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("EMAIL_PROVIDER", "resend");
    stubEnv("RESEND_API_KEY", undefined);
    stubEnv("EMAIL_FROM", undefined);
    // Neither the flag nor an outbox directory may rescue production.
    stubEnv("EMAIL_OUTBOX_DIR", "C:\\temp\\some-outbox");
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("treats empty-string configuration as unconfigured (the E2E guard's mechanism)", () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("EMAIL_PROVIDER", "resend");
    stubEnv("RESEND_API_KEY", "");
    stubEnv("EMAIL_FROM", "");
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
  });

  it("selects Resend in production with complete configuration when the flag matches", () => {
    stubProductionResend();
    stubEnv("EMAIL_PROVIDER", "resend");
    expect(resolveEmailAdapter().name).toBe("resend");
    expect(isEmailDeliveryAvailable()).toBe(true);
  });

  it("selects Resend in production with complete configuration when the flag points elsewhere", () => {
    stubProductionResend();
    stubEnv("EMAIL_PROVIDER", "console");
    expect(resolveEmailAdapter().name).toBe("resend");
    expect(isEmailDeliveryAvailable()).toBe(true);
  });
});

describe("delivery failure classification", () => {
  it("maps an adapter that throws mid-send to 'unavailable' and never logs the raw token", async () => {
    stubEnv("NODE_ENV", "test");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    vi.spyOn(resolveEmailAdapter(), "send").mockRejectedValue(
      new Error("smtp down while sending the message"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendPasswordResetEmail({
      to: "user@example.com",
      name: "کاربر",
      rawToken: "the-raw-token",
    });

    // Generic outcome; the raw error stays in server logs only.
    expect(outcome).toBe("unavailable");
    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      for (const part of call) {
        expect(String(part)).not.toContain("the-raw-token");
      }
    }
    errorSpy.mockRestore();
  });
});

describe("error classes", () => {
  it("EmailDeliveryUnavailableError is a named Error subclass", () => {
    const error = new EmailDeliveryUnavailableError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EmailDeliveryUnavailableError");
  });

  it("EmailProviderError keeps only its sanitized code", () => {
    const error = new EmailProviderError("rate_limit_exceeded");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EmailProviderError");
    expect(error.code).toBe("rate_limit_exceeded");
    expect(error.message).toContain("rate_limit_exceeded");
  });
});
