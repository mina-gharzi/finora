import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "--font-pinar", className: "font-pinar" }),
}));

import RootLayout from "../app/layout";
import Home from "../app/page";

afterEach(cleanup);

describe("RootLayout", () => {
  it("renders the document shell with lang, the Pinar font variable and its children", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <main>page content</main>
      </RootLayout>,
    );

    expect(html).toContain('lang="en"');
    expect(html).toContain("--font-pinar");
    expect(html).toContain("antialiased");
    expect(html).toContain("page content");
  });
});

describe("Home", () => {
  it("renders the main landmark, the logo and the getting started heading", () => {
    render(<Home />);

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "To get started, edit the",
    );
    expect(screen.getByAltText("Next.js logo")).toBeTruthy();
  });
});
