import type { AnchorHTMLAttributes } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NavItem } from "@/components/ui/nav-item";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/ui/text-field";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Button", () => {
  it("defaults to a plain, non-submitting button", () => {
    render(<Button>ذخیره</Button>);

    const button = screen.getByRole("button", { name: "ذخیره" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
  });

  it("exposes a busy state while loading", () => {
    render(<Button loading>ذخیره</Button>);

    const button = screen.getByRole("button", { name: "ذخیره" });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("stays non-interactive when disabled", () => {
    render(
      <Button variant="danger" disabled>
        حذف
      </Button>,
    );

    const button = screen.getByRole("button", { name: "حذف" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });
});

describe("TextField", () => {
  it("associates its label with the input", () => {
    render(<TextField label="مبلغ" />);

    const input = screen.getByLabelText("مبلغ");
    expect(input.tagName).toBe("INPUT");
    expect(input.id).toBeTruthy();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
  });

  it("links description and error text through aria-describedby", () => {
    render(
      <TextField
        label="مبلغ"
        description="به تومان وارد کنید"
        error="مقدار نامعتبر است"
      />,
    );

    const input = screen.getByLabelText("مبلغ");
    expect(input.getAttribute("aria-invalid")).toBe("true");

    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(describedBy).toHaveLength(2);

    const [descriptionId, errorId] = describedBy;
    const description = document.getElementById(descriptionId ?? "");
    const error = document.getElementById(errorId ?? "");
    expect(description?.textContent).toBe("به تومان وارد کنید");
    expect(error?.textContent).toContain("مقدار نامعتبر است");
  });

  it("does not mark the control invalid without an error", () => {
    render(<TextField label="مبلغ" description="راهنما" />);

    const input = screen.getByLabelText("مبلغ");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
  });
});

describe("Alert", () => {
  it("announces non-danger messages politely", () => {
    render(<Alert variant="info">اطلاعات</Alert>);

    const alert = screen.getByRole("status");
    expect(alert.getAttribute("aria-live")).toBe("polite");
  });

  it("announces danger messages assertively", () => {
    render(<Alert variant="danger">خطا</Alert>);

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });
});

describe("NavItem", () => {
  it("marks the active destination for assistive technology", () => {
    render(<NavItem label="داشبورد" href="/" active />);

    const link = screen.getByRole("link", { name: "داشبورد" });
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.getAttribute("href")).toBe("/");
  });

  it("renders placeholders as non-interactive text", () => {
    render(<NavItem label="گزارش‌ها" disabled />);

    expect(screen.queryByRole("link", { name: "گزارش‌ها" })).toBeNull();

    const placeholder = screen
      .getByText("گزارش‌ها")
      .closest('[aria-disabled="true"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.hasAttribute("href")).toBe(false);
  });
});

describe("Spinner", () => {
  it("announces a default busy label", () => {
    render(<Spinner />);

    const spinner = screen.getByRole("status");
    expect(spinner.textContent).toContain("در حال بارگذاری");
  });

  it("can render as a purely decorative indicator", () => {
    render(<Spinner label={null} />);

    expect(screen.queryByRole("status")).toBeNull();
    const spinner = document.querySelector('[data-slot="spinner"]');
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("ThemeToggle", () => {
  it("exposes the dark mode state and persists the choice", async () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "حالت تیره" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("keeps a stable accessible name across states", async () => {
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: "حالت تیره" });
    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(
      screen.getByRole("button", { name: "حالت تیره" }).getAttribute("title"),
    ).toBe("تغییر حالت نمایش");
  });
});
