"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Responsive application shell: a topbar, a desktop sidebar, a mobile
 * navigation panel and the main content region. Layout uses logical spacing so
 * it works unchanged in the right-to-left Persian interface.
 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:z-50"
      >
        پرش به محتوای اصلی
      </a>

      <Topbar menuOpen={menuOpen} onToggleMenu={toggleMenu} />
      <MobileNav open={menuOpen} activePath={pathname} onNavigate={closeMenu} />

      <div className="flex flex-1">
        <Sidebar activePath={pathname} />
        <main
          id="main-content"
          className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
