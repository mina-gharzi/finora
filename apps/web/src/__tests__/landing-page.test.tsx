/**
 * @vitest-environment jsdom
 */
import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

import { LandingPage } from "@/components/landing/landing-page";

afterEach(cleanup);

describe("LandingPage", () => {
  it("renders a single top-level heading for anonymous visitors", () => {
    render(<LandingPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);

    // The headline is marketing copy and changes with the design, so assert
    // the PROMISE it makes instead of the exact sentence: it is non-empty, it
    // carries no invented number, and the hero names capabilities the app
    // actually ships.
    const headline = headings[0]?.textContent?.trim() ?? "";
    expect(headline.length).toBeGreaterThan(0);
    expect(headline).not.toMatch(/\d/);

    const hero = document.body.textContent ?? "";
    for (const claim of ["تراکنش", "بودجه", "گزارش"]) {
      expect(hero).toContain(claim);
    }
  });

  it("exposes the main landmark", () => {
    render(<LandingPage />);
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("links every primary call to action to the register or login routes", () => {
    render(<LandingPage />);

    const registerLinks = screen.getAllByRole("link", { name: "شروع رایگان" });
    expect(registerLinks.length).toBeGreaterThan(0);
    for (const link of registerLinks) {
      expect(link.getAttribute("href")).toBe("/register");
    }

    const loginLinks = screen.getAllByRole("link", { name: "ورود به حساب" });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) {
      expect(link.getAttribute("href")).toBe("/login");
    }
  });

  it("describes only shipped features without fabricated metrics", () => {
    render(<LandingPage />);

    const features = screen.getByRole("region", {
      name: "سه کار اصلی، بدون شلوغی",
    });
    const items = within(features).getAllByRole("listitem");
    expect(items).toHaveLength(6);

    // "Without fabricated metrics": the feature copy states no numbers.
    for (const item of items) {
      expect(item.textContent ?? "").not.toMatch(/\d/);
    }
  });

  it("presents the getting-started steps as an ordered list", () => {
    render(<LandingPage />);

    const steps = screen.getByRole("region", { name: "در سه گام شروع کنید" });
    const list = within(steps).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });
});
