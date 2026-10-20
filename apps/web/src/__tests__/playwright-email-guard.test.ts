/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { serverEnvWithEmailDeliveryDisabled } from "../../e2e/email-guard";

const EMAIL_KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_PROVIDER"] as const;
const PROBE_KEY = "FINORA_EMAIL_GUARD_PROBE";
const saved: Record<string, string | undefined> = {};

function stub(key: string, value: string | undefined): void {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  stub("RESEND_API_KEY", "re_fake_ambient_key_never_real");
  stub("EMAIL_FROM", "Finora <ambient@example.com>");
  stub("EMAIL_PROVIDER", "resend");
  stub(PROBE_KEY, "probe-value");
});

afterEach(() => {
  for (const key of [...EMAIL_KEYS, PROBE_KEY]) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    delete saved[key];
  }
});

describe("E2E server environment guard (playwright webServer.env)", () => {
  it("blanks all three email variables so the spawned server can never send", () => {
    const env = serverEnvWithEmailDeliveryDisabled();
    expect(env.RESEND_API_KEY).toBe("");
    expect(env.EMAIL_FROM).toBe("");
    expect(env.EMAIL_PROVIDER).toBe("");
  });

  it("preserves unrelated environment variables required by the suite", () => {
    const env = serverEnvWithEmailDeliveryDisabled();
    expect(env[PROBE_KEY]).toBe("probe-value");
    // The copy must still carry a real value for anything the suite relies on.
    expect(env.DATABASE_URL).toBe(process.env.DATABASE_URL);
    expect(env.SESSION_SECRET).toBe(process.env.SESSION_SECRET);
  });

  it("returns plain strings only (Playwright's Record<string, string> contract)", () => {
    const env = serverEnvWithEmailDeliveryDisabled();
    for (const value of Object.values(env)) {
      expect(typeof value).toBe("string");
    }
  });

  it("never mutates the caller's process.env", () => {
    serverEnvWithEmailDeliveryDisabled();
    expect(process.env.RESEND_API_KEY).toBe("re_fake_ambient_key_never_real");
    expect(process.env.EMAIL_PROVIDER).toBe("resend");
  });

  it("wins over ambient values regardless of what was set before the call", () => {
    stub("RESEND_API_KEY", undefined);
    stub("EMAIL_FROM", undefined);
    const env = serverEnvWithEmailDeliveryDisabled();
    expect(env.RESEND_API_KEY).toBe("");
    expect(env.EMAIL_FROM).toBe("");
  });
});
