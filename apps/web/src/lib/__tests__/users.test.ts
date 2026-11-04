/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDbState } from "@/lib/finance/__tests__/fake-db";

const h = vi.hoisted(() => ({
  state: {
    selectQueue: [],
    insertResult: [],
    updateResult: [],
    deleteResult: [],
    insertedValues: [],
    updatedValues: [],
    insertCalls: 0,
    updateCalls: 0,
    deleteCalls: 0,
    whereConditions: [],
  } as FakeDbState,
}));

vi.mock("@/db", async () => {
  const { createFakeDb } = await import(
    "@/lib/finance/__tests__/fake-db"
  );
  return { getDb: () => createFakeDb(h.state) };
});

import { isEmailVerifiedFor } from "@/lib/users";

const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  h.state.selectQueue = [];
});

afterEach(() => {
  delete process.env.EMAIL_VERIFICATION_REQUIRED;
});

describe("isEmailVerifiedFor", () => {
  it("requires verification by default", async () => {
    h.state.selectQueue = [[{ emailVerifiedAt: null }]];

    await expect(isEmailVerifiedFor(USER_ID)).resolves.toBe(false);
  });

  it("treats an existing unverified user as verified when the switch is off", async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "false";
    h.state.selectQueue = [[{ emailVerifiedAt: null }]];

    await expect(isEmailVerifiedFor(USER_ID)).resolves.toBe(true);
  });

  it("still treats a missing user as unverified when the switch is off", async () => {
    process.env.EMAIL_VERIFICATION_REQUIRED = "false";
    h.state.selectQueue = [[]];

    await expect(isEmailVerifiedFor(USER_ID)).resolves.toBe(false);
  });

  it("keeps verified users verified when verification is required", async () => {
    h.state.selectQueue = [[{ emailVerifiedAt: new Date() }]];

    await expect(isEmailVerifiedFor(USER_ID)).resolves.toBe(true);
  });
});
