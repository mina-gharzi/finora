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
    expect(headings[0]?.textContent).toContain("درآمد");
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

    const features = screen.getByRole("region", { name: "هر آنچه برای پیگیری مالی لازم دارید" });
    const items = within(features).getAllByRole("listitem");
    expect(items).toHaveLength(6);
  });

  it("presents the getting-started steps as an ordered list", () => {
    render(<LandingPage />);

    const steps = screen.getByRole("region", { name: "در سه گام شروع کنید" });
    const list = within(steps).getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });
});
