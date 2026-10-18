/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/account-labels";
import {
  NO_CATEGORY_LABEL,
  TRANSACTION_TYPE_LABELS,
} from "@/lib/finance/transaction-labels";
import {
  ACCOUNT_TYPES,
  TRANSACTION_TYPES,
} from "@/lib/finance/types";

/**
 * The account badges, transaction badges, dashboard breakdown and history rows
 * all look values up in these maps. A missing key would surface the raw enum
 * value (e.g. `wallet`) in the Persian UI, so completeness is enforced here.
 */
describe("ACCOUNT_TYPE_LABELS", () => {
  it("labels every account type", () => {
    for (const type of ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_LABELS[type]).toBeTruthy();
      expect(ACCOUNT_TYPE_LABELS[type]).toBe(
        ACCOUNT_TYPE_LABELS[type].trim(),
      );
    }
  });

  it("declares no label for an unknown account type", () => {
    expect(Object.keys(ACCOUNT_TYPE_LABELS).sort()).toEqual(
      [...ACCOUNT_TYPES].sort(),
    );
  });
});

describe("TRANSACTION_TYPE_LABELS", () => {
  it("labels every transaction type with a distinct, non-empty Persian label", () => {
    for (const type of TRANSACTION_TYPES) {
      expect(TRANSACTION_TYPE_LABELS[type]).toBeTruthy();
    }
    const labels = TRANSACTION_TYPES.map((type) =>
      TRANSACTION_TYPE_LABELS[type],
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("declares no label for an unknown transaction type", () => {
    expect(Object.keys(TRANSACTION_TYPE_LABELS).sort()).toEqual(
      [...TRANSACTION_TYPES].sort(),
    );
  });
});

describe("NO_CATEGORY_LABEL", () => {
  it("is a non-empty label that never collides with a type label", () => {
    expect(NO_CATEGORY_LABEL.trim()).toBe(NO_CATEGORY_LABEL);
    expect(NO_CATEGORY_LABEL.length).toBeGreaterThan(0);
    expect(Object.values(TRANSACTION_TYPE_LABELS)).not.toContain(
      NO_CATEGORY_LABEL,
    );
  });
});
