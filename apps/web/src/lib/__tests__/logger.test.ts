/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLogger,
  logger,
  normalizeErrorValue,
  resetLogLevelCacheForTests,
  __testing,
} from "@/lib/logger";

/** Captures one console method as raw string lines. */
function capture(method: "info" | "warn" | "error" | "debug") {
  return vi.spyOn(console, method).mockImplementation(() => {});
}

let info: ReturnType<typeof capture>;
let warn: ReturnType<typeof capture>;
let error: ReturnType<typeof capture>;
let debug: ReturnType<typeof capture>;

beforeEach(() => {
  vi.unstubAllEnvs();
  resetLogLevelCacheForTests();
  info = capture("info");
  warn = capture("warn");
  error = capture("error");
  debug = capture("debug");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetLogLevelCacheForTests();
});

/** Parses the single JSON record a spy received. */
function recordFrom(spy: ReturnType<typeof capture>): Record<string, unknown> {
  expect(spy).toHaveBeenCalledTimes(1);
  const [line] = spy.mock.calls[0];
  expect(typeof line).toBe("string");
  return JSON.parse(line as string);
}

describe("structured record shape", () => {
  it("emits a single-line JSON record with timestamp, level, event and metadata", () => {
    const log = createLogger();
    log.info("auth.login.succeeded", { userId: "u-1" });

    const record = recordFrom(info);
    expect(record.level).toBe("info");
    expect(record.event).toBe("auth.login.succeeded");
    expect(record.userId).toBe("u-1");
    expect(typeof record.timestamp).toBe("string");
    // ISO-8601 UTC, parseable.
    expect(Number.isNaN(Date.parse(record.timestamp as string))).toBe(false);
  });

  it("routes each level to its matching console method", () => {
    const log = createLogger();
    vi.stubEnv("LOG_LEVEL", "debug");
    resetLogLevelCacheForTests();

    log.debug("e.debug");
    log.info("e.info");
    log.warn("e.warn");
    log.error("e.error");

    expect(recordFrom(debug).level).toBe("debug");
    expect(recordFrom(info).level).toBe("info");
    expect(recordFrom(warn).level).toBe("warn");
    expect(recordFrom(error).level).toBe("error");
  });

  it("attaches a requestId when the context provides one", () => {
    createLogger({ requestId: "req-abc-123" }).info("health.ok");
    expect(recordFrom(info).requestId).toBe("req-abc-123");
  });

  it("omits requestId when no context is provided", () => {
    createLogger().info("health.ok");
    expect(recordFrom(info)).not.toHaveProperty("requestId");
  });

  it("merges context metadata into every record", () => {
    createLogger({ metadata: { service: "web" } }).warn("cache.miss", {
      key: "x",
    });
    const record = recordFrom(warn);
    expect(record.service).toBe("web");
    expect(record.key).toBe("x");
  });

  it("lets per-call metadata override context metadata", () => {
    createLogger({ metadata: { stage: "a" } }).info("e", { stage: "b" });
    expect(recordFrom(info).stage).toBe("b");
  });
});

describe("level threshold", () => {
  it("drops records below the configured LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    resetLogLevelCacheForTests();
    const log = createLogger();

    log.debug("e.debug");
    log.info("e.info");
    log.warn("e.warn");

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("defaults to debug outside production and info in production", () => {
    vi.stubEnv("LOG_LEVEL", "");
    vi.stubEnv("NODE_ENV", "development");
    resetLogLevelCacheForTests();
    createLogger().debug("e.dev");
    expect(debug).toHaveBeenCalledTimes(1);

    debug.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    resetLogLevelCacheForTests();
    createLogger().debug("e.prod");
    expect(debug).not.toHaveBeenCalled();
  });

  it("falls back to the default for an unknown LOG_LEVEL value", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    vi.stubEnv("NODE_ENV", "production");
    resetLogLevelCacheForTests();
    createLogger().info("e.info");
    createLogger().debug("e.debug");
    expect(info).toHaveBeenCalledTimes(1);
    expect(debug).not.toHaveBeenCalled();
  });
});

describe("error normalisation", () => {
  it("reduces an Error to name/code/message without a stack", () => {
    const err = new Error("something broke");
    Object.assign(err, { code: "ECONNREFUSED" });

    createLogger().error("db.query.failed", { error: err });

    const record = recordFrom(error);
    const normalized = record.error as Record<string, unknown>;
    expect(normalized.name).toBe("Error");
    expect(normalized.code).toBe("ECONNREFUSED");
    expect(normalized.message).toBe("something broke");
    expect(normalized).not.toHaveProperty("stack");
  });

  it("handles a thrown non-Error value without crashing", () => {
    createLogger().error("job.failed", { error: "plain string failure" });
    expect((recordFrom(error).error as string)).toBe("plain string failure");

    error.mockClear();
    createLogger().error("job.failed", { error: { reason: "object thrown" } });
    expect(recordFrom(error).error).toEqual({ reason: "object thrown" });
  });

  it("normalizes errors nested in arrays and objects", () => {
    const wrapped = { causes: [new Error("inner")] };
    createLogger().error("e", { detail: wrapped });
    const detail = recordFrom(error).detail as {
      causes: Array<Record<string, unknown>>;
    };
    expect(detail.causes[0].name).toBe("Error");
    expect(detail.causes[0].message).toBe("inner");
  });
});

describe("sensitive-data redaction", () => {
  it("drops blocked metadata keys entirely", () => {
    createLogger().info("auth.register", {
      password: "hunter2",
      passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
      rawToken: "tok_123",
      setCookie: "finora_session=abc",
      authorization: "Bearer xyz",
      apiKey: "key_abc",
      secret: "shh",
      userId: "u-1",
    });

    const record = recordFrom(info);
    expect(record.userId).toBe("u-1");
    for (const key of [
      "password",
      "passwordHash",
      "rawToken",
      "setCookie",
      "authorization",
      "apiKey",
      "secret",
    ]) {
      expect(record).not.toHaveProperty(key);
    }
    const serialized = JSON.stringify(record);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("tok_123");
    expect(serialized).not.toContain("key_abc");
    expect(serialized).not.toContain("shh");
  });

  it("drops blocked keys nested inside objects", () => {
    createLogger().info("profile", {
      account: { name: "بانک", password: "leak", sessionToken: "leak2" },
    });
    const account = recordFrom(info).account as Record<string, unknown>;
    expect(account.name).toBe("بانک");
    expect(account).not.toHaveProperty("password");
    expect(account).not.toHaveProperty("sessionToken");
  });

  it("scrubs email addresses out of string values", () => {
    createLogger().info("email.sent", { to: "victim@example.com" });
    const record = recordFrom(info);
    expect(record.to).toBe("[redacted-email]");
    expect(JSON.stringify(record)).not.toContain("victim@example.com");
  });

  it("strips URL query strings that could carry a recovery token", () => {
    createLogger().warn("link", {
      url: "https://app.example.com/verify-email?token=live-secret",
    });
    const record = recordFrom(warn);
    expect(record.url).toBe("https://app.example.com/verify-email");
    expect(JSON.stringify(record)).not.toContain("live-secret");
  });

  it("replaces bare token/secret assignments", () => {
    createLogger().warn("detail", { note: "token=live-secret&x=1" });
    expect(JSON.stringify(recordFrom(warn))).not.toContain("live-secret");
  });

  it("replaces JWTs and Bearer credentials", () => {
    createLogger().info("auth", {
      a: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.abcdefghijklmnop",
      b: "Bearer abc.def.ghi",
    });
    const record = recordFrom(info);
    expect(record.a).toBe("[redacted-jwt]");
    expect(record.b).toBe("Bearer [redacted]");
  });

  it("scrubs secrets echoed by an error message", () => {
    const err = new Error(
      "request to https://api.example.com/send?api_key=SECRETKEY failed for user@example.com",
    );
    createLogger().error("provider.failed", { error: err });
    const serialized = JSON.stringify(recordFrom(error));
    expect(serialized).not.toContain("SECRETKEY");
    expect(serialized).not.toContain("user@example.com");
  });

  it("never serializes a request body or financial record wholesale", () => {
    // A caller that mistakenly passes an over-large, sensitive object still
    // cannot leak blocked fields or exceed the caps.
    createLogger().info("request.failed", {
      body: {
        password: "hunter2",
        transactions: Array.from({ length: 100 }, (_, i) => ({
          description: `secret-note-${i}`,
        })),
      },
    });
    const record = recordFrom(info);
    const body = record.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("password");
    expect((body.transactions as unknown[]).length).toBeLessThanOrEqual(20);
  });

  it("does not let callers spoof reserved fields", () => {
    createLogger().info("real.event", {
      level: "info",
      event: "spoofed.event",
      timestamp: "1970-01-01",
    });
    const record = recordFrom(info);
    expect(record.event).toBe("real.event");
    expect(record.level).toBe("info");
    expect(record.timestamp).not.toBe("1970-01-01");
  });
});

describe("module logger and helpers", () => {
  it("exposes a ready-to-use process logger", () => {
    logger.info("startup.ready");
    expect(recordFrom(info).event).toBe("startup.ready");
  });

  it("normalizeErrorValue wraps an Error and sanitizes other values", () => {
    expect(normalizeErrorValue(new Error("boom")).error).toMatchObject({
      name: "Error",
      message: "boom",
    });
    expect(normalizeErrorValue("plain").error).toBe("plain");
    expect(normalizeErrorValue(undefined).error).toBeUndefined();
  });

  it("scrubString is idempotent on already-safe text", () => {
    expect(__testing.scrubString("plain safe text")).toBe("plain safe text");
  });

  it("caps a very long string", () => {
    const long = "a".repeat(5000);
    expect(__testing.scrubString(long).length).toBeLessThanOrEqual(512);
  });
});
