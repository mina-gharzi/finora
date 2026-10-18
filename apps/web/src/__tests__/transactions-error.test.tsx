/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TransactionsError from "@/app/(app)/transactions/error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TransactionsError", () => {
  it("explains the failure and retries on request", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();

    render(<TransactionsError error={new Error("boom")} retry={retry} />);

    expect(screen.getByText("بارگذاری تراکنش‌ها ناموفق بود")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "تلاش مجدد" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
