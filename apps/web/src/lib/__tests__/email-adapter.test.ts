/**
 * @vitest-environment node
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  isProduction: () => process.env.NODE_ENV === "production",
  getAppUrl: () => "http://127.0.0.1:3000",
}));

import {
  EmailDeliveryUnavailableError,
  isEmailDeliveryAvailable,
  resolveEmailAdapter,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/adapter";

const saved: Record<string, string | undefined> = {};
const KEYS = ["NODE_ENV", "EMAIL_OUTBOX_DIR"];

function stubEnv(key: string, value: string | undefined): void {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete saved[key];
  }
  vi.restoreAllMocks();
});

describe("production behaviour", () => {
  it("never selects a console or file adapter", () => {
    stubEnv("NODE_ENV", "production");
    stubEnv("EMAIL_OUTBOX_DIR", undefined);
    expect(resolveEmailAdapter().name).toBe("unconfigured");
    expect(isEmailDeliveryAvailable()).toBe(false);
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

describe("EmailDeliveryUnavailableError", () => {
  it("is a named Error subclass", () => {
    const error = new EmailDeliveryUnavailableError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EmailDeliveryUnavailableError");
  });
});
