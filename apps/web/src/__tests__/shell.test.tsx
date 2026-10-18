import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppShell } from "@/components/layout/app-shell";

afterEach(cleanup);

function sidebar(): HTMLElement | null {
  return document.querySelector("aside");
}

describe("AppShell", () => {
  it("exposes the skip link, banner and main landmarks", () => {
    render(
      <AppShell>
        <p>page body</p>
      </AppShell>,
    );

    const skip = screen.getByRole("link", { name: "پرش به محتوای اصلی" });
    expect(skip.getAttribute("href")).toBe("#main-content");

    expect(screen.getByRole("banner")).toBeTruthy();

    const main = screen.getByRole("main");
    expect(main.getAttribute("id")).toBe("main-content");
    expect(main.textContent).toContain("page body");

    expect(screen.getByRole("banner").textContent).toContain("فینورا");
    expect(screen.getByText("نسخه 0.1.0")).toBeTruthy();
  });

  it("marks the current destination and keeps placeholders non-navigable", () => {
    render(<AppShell>content</AppShell>);

    const aside = sidebar();
    expect(aside).not.toBeNull();
    if (!aside) return;

    expect(aside.querySelectorAll("a")).toHaveLength(3);

    const current = screen.getByRole("link", { name: "داشبورد" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.getAttribute("href")).toBe("/");

    const transactions = screen.getByRole("link", { name: "تراکنش‌ها" });
    expect(transactions.getAttribute("href")).toBe("/transactions");

    const accounts = screen.getByRole("link", { name: "حساب‌ها" });
    expect(accounts.getAttribute("href")).toBe("/accounts");

    expect(
      aside.querySelectorAll('[aria-disabled="true"]'),
    ).toHaveLength(3);
    expect(aside.querySelectorAll("li")).toHaveLength(6);
    expect(aside.textContent).toContain("به‌زودی");
  });

  it("never renders a disabled placeholder as a link", () => {
    render(<AppShell>content</AppShell>);

    const aside = sidebar();
    if (!aside) return;

    for (const placeholder of aside.querySelectorAll('[aria-disabled="true"]')) {
      expect(placeholder.tagName).toBe("SPAN");
    }
  });

  it("opens and closes the mobile navigation panel", () => {
    render(<AppShell>content</AppShell>);

    const panel = document.getElementById("mobile-nav");
    expect(panel).not.toBeNull();
    if (!panel) return;

    expect(panel.hasAttribute("hidden")).toBe(true);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);

    const opener = screen.getByRole("button", { name: "باز کردن منو" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(opener);

    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(opener.getAttribute("aria-controls")).toBe("mobile-nav");
    expect(screen.getAllByRole("navigation")).toHaveLength(2);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(panel.hasAttribute("hidden")).toBe(true);
    expect(opener.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "باز کردن منو" })).toBeTruthy();
  });

  it("keeps the desktop sidebar hidden from mobile navigation", () => {
    render(<AppShell>content</AppShell>);

    const aside = sidebar();
    expect(aside?.className).toContain("lg:flex");
    expect(aside?.className).toContain("hidden");
  });
});
