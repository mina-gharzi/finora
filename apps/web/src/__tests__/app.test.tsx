import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "--font-pinar", className: "font-pinar" }),
}));

import RootLayout, { metadata } from "../app/layout";
import DashboardPage from "../app/(app)/page";

afterEach(cleanup);

describe("RootLayout", () => {
  it("renders the Persian document shell with the Pinar font and its children", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main>page content</main>
      </RootLayout>,
    );

    expect(html).toContain('lang="fa"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("--font-pinar");
    expect(html).toContain("antialiased");
    expect(html).toContain("page content");
  });

  it("ships a default theme and the pre-hydration theme script", () => {
    const html = renderToStaticMarkup(<RootLayout>content</RootLayout>);

    expect(html).toContain('data-theme="light"');
    expect(html).toContain('localStorage.getItem');
    expect(html).toContain('finora-theme');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('document.documentElement.setAttribute("data-theme"');
  });

  it("exposes Persian metadata", () => {
    const title = metadata.title as { default: string };
    expect(title.default).toContain("فینورا");
    expect(metadata.description).toBeTruthy();
  });
});

describe("DashboardPage", () => {
  it("renders the dashboard heading, the status notice and the empty state", () => {
    render(<DashboardPage />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("داشبورد");

    expect(screen.getByRole("status").textContent).toContain("در حال ساخت");

    const emptyTitle = screen.getByRole("heading", {
      level: 2,
      name: "هنوز تراکنشی ثبت نشده است",
    });
    expect(emptyTitle.textContent).toContain("هنوز تراکنشی ثبت نشده است");
  });

  it("keeps the unimplemented action explicitly disabled", () => {
    render(<DashboardPage />);

    const button = screen.getByRole("button", { name: "افزودن تراکنش" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});
