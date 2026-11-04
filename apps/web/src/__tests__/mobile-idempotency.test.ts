/**
 * @vitest-environment node
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  state: {
    rows: [] as Array<Record<string, unknown>>,
    getDbCalls: 0,
  },
}));

vi.mock("@/db", () => ({
  getDb: () => {
    h.state.getDbCalls += 1;
    return createDb();
  },
}));

function sqlText(condition: unknown): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(condition as never);
}

function makeInsert() {
  let values: Record<string, unknown> = {};
  const chain = {
    where: () => chain,
    values: (value: unknown) => {
      values = value as Record<string, unknown>;
      return chain;
    },
    set: () => chain,
    from: () => chain,
    limit: () => Promise.resolve([]),
    onConflictDoNothing: () => chain,
    returning: () => {
      const exists = h.state.rows.some(
        (row) => row.userId === values.userId && row.key === values.key,
      );
      if (exists) {
        return Promise.resolve([]);
      }

      const row = {
        id: `row-${h.state.rows.length + 1}`,
        responseStatus: null,
        responseBody: null,
        createdAt: new Date(),
        ...values,
      };
      h.state.rows.push(row);
      return Promise.resolve([{ id: row.id }]);
    },
  };

  return chain;
}

function makeDelete() {
  const chain = {
    where: (condition?: unknown) => {
      const query = sqlText(condition);
      if (query.sql.includes("expires_at")) {
        const userId = query.params[0];
        h.state.rows = h.state.rows.filter(
          (row) =>
            !(
              row.userId === userId &&
              (row.expiresAt as Date).getTime() <= Date.now()
            ),
        );
      } else {
        const [userId, key] = query.params;
        h.state.rows = h.state.rows.filter(
          (row) => !(row.userId === userId && row.key === key),
        );
      }
      return Promise.resolve(undefined);
    },
    values: () => chain,
    set: () => chain,
    from: () => chain,
    limit: () => Promise.resolve([]),
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([]),
  };

  return chain;
}

function makeSelect() {
  let condition: unknown;
  const chain = {
    where: (value?: unknown) => {
      condition = value;
      return chain;
    },
    values: () => chain,
    set: () => chain,
    from: () => chain,
    limit: () => {
      const [userId, key] = sqlText(condition).params;
      return Promise.resolve(
        h.state.rows.filter(
          (row) => row.userId === userId && row.key === key,
        ),
      );
    },
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([]),
  };

  return chain;
}

function makeUpdate() {
  let values: Record<string, unknown> = {};
  const chain = {
    where: (condition?: unknown) => {
      const [userId, key] = sqlText(condition).params;
      for (const row of h.state.rows) {
        if (row.userId === userId && row.key === key) {
          Object.assign(row, values);
        }
      }
      return Promise.resolve(undefined);
    },
    values: () => chain,
    set: (value: unknown) => {
      values = value as Record<string, unknown>;
      return chain;
    },
    from: () => chain,
    limit: () => Promise.resolve([]),
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([]),
  };

  return chain;
}

function createDb() {
  return {
    insert: () => makeInsert(),
    delete: () => makeDelete(),
    select: () => makeSelect(),
    update: () => makeUpdate(),
  };
}

import { withIdempotency } from "@/lib/mobile/idempotency";

const KEY = "key-12345678";
const USER = "user-1";
const PATH = "/api/v1/transactions";

function request(
  body = '{"amount":1000}',
  key: string | null = KEY,
  method = "POST",
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (key !== null) {
    headers.set("Idempotency-Key", key);
  }

  return new Request(`http://localhost${PATH}`, {
    method,
    headers,
    body,
  });
}

function hash(method: string, body: string): string {
  return createHash("sha256")
    .update(`${method} ${PATH}\n${body}`)
    .digest("hex");
}

function okResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  h.state.rows = [];
  h.state.getDbCalls = 0;
});

describe("withIdempotency without a key", () => {
  it("runs the handler directly and never touches the database", async () => {
    const handler = vi.fn(async () => okResponse({ id: "t1" }));

    const response = await withIdempotency(request("{}", null), USER, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "t1" });
    expect(h.state.getDbCalls).toBe(0);
  });
});

describe("withIdempotency with a key", () => {
  it("runs the handler once and stores the successful response", async () => {
    const handler = vi.fn(async () => okResponse({ id: "t1" }));

    const response = await withIdempotency(request(), USER, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(201);
    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0]).toMatchObject({
      userId: USER,
      key: KEY,
      requestHash: hash("POST", '{"amount":1000}'),
      responseStatus: 201,
      responseBody: { id: "t1" },
    });
  });

  it("replays the stored response for the same key and body", async () => {
    const handler = vi.fn(async () => okResponse({ id: "t1" }));
    const body = '{"amount":1000}';

    const first = await withIdempotency(request(body), USER, handler);
    const second = await withIdempotency(request(body), USER, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(first.status);
    expect(second.headers.get("Idempotency-Replayed")).toBe("true");
    expect(second.headers.get("cache-control")).toBe("no-store");
    expect(await second.json()).toEqual(await first.json());
  });

  it("rejects reuse of the same key with a different body", async () => {
    const handler = vi.fn(async () => okResponse({ id: "t1" }));

    await withIdempotency(request('{"amount":1000}'), USER, handler);
    const second = await withIdempotency(
      request('{"amount":2000}'),
      USER,
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(422);
    expect(await second.json()).toMatchObject({
      error: "idempotency_key_reuse",
    });
  });

  it("returns 409 while the first attempt is still in progress", async () => {
    const body = '{"amount":1000}';
    h.state.rows.push({
      id: "row-1",
      userId: USER,
      key: KEY,
      requestHash: hash("POST", body),
      responseStatus: null,
      responseBody: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const handler = vi.fn(async () => okResponse({ id: "t1" }));
    const response = await withIdempotency(request(body), USER, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(await response.json()).toMatchObject({
      error: "request_in_progress",
    });
  });

  it("deletes the claim when the handler returns a non-2xx response", async () => {
    const handler = vi.fn(async () => okResponse({ error: "nope" }, 422));

    const response = await withIdempotency(request(), USER, handler);

    expect(response.status).toBe(422);
    expect(h.state.rows).toHaveLength(0);
  });

  it("deletes the claim when the handler throws", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(withIdempotency(request(), USER, handler)).rejects.toThrow(
      "boom",
    );

    expect(h.state.rows).toHaveLength(0);
  });

  it("rejects a malformed key before touching the database", async () => {
    const handler = vi.fn(async () => okResponse({ id: "t1" }));

    const response = await withIdempotency(request("{}", "short"), USER, handler);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_request" });
    expect(handler).not.toHaveBeenCalled();
    expect(h.state.getDbCalls).toBe(0);
  });

  it("scopes keys per user so the same key runs for a second user", async () => {
    const handler = vi.fn(async () => okResponse({ id: "t1" }));
    const body = '{"amount":1000}';

    await withIdempotency(request(body), "user-1", handler);
    await withIdempotency(request(body), "user-2", handler);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(h.state.rows).toHaveLength(2);
  });
});
