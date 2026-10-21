"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

/**
 * Small client-side pieces of the landing header.
 *
 * - HeaderDate: today's Jalali date as a quiet chip. It is read on the client
 *   only (the page may be statically rendered, so a server-rendered date would
 *   go stale). The server snapshot is empty, which keeps hydration safe, and
 *   the chip reserves its width so nothing shifts when the text appears.
 * - MobileMenu: a disclosure menu for small screens. Closes on link click,
 *   Escape, or a tap outside.
 */

const subscribe = () => () => {};

function todayJalali() {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function HeaderDate() {
  const text = useSyncExternalStore(subscribe, todayJalali, () => "");

  return (
    <span className="hidden h-8 min-w-36 items-center justify-center gap-1.5 rounded-full bg-surface-muted px-3 text-xs text-muted-foreground lg:inline-flex">
      <svg
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="2" y="3" width="12" height="11" rx="2" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
      </svg>
      <span>{text}</span>
    </span>
  );
}

interface MobileMenuProps {
  items: { href: string; label: string }[];
  loginHref: string;
}

export function MobileMenu({ items, loginHref }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const itemClass =
    "block rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <div ref={rootRef} className="relative md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "بستن منو" : "باز کردن منو"}
        onClick={() => setOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <path d="M5 5l10 10M15 5L5 15" />
          ) : (
            <path d="M4 7h12M4 13h12" />
          )}
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute inset-e-0 top-full mt-3 w-56 rounded-2xl border border-border bg-surface p-2 shadow-lg"
        >
          <nav aria-label="بخش‌های صفحه" className="flex flex-col">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="my-1 border-t border-border" />
          <Link
            href={loginHref}
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            ورود به حساب
          </Link>
        </div>
      )}
    </div>
  );
}