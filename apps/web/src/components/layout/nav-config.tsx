import type { ReactNode } from "react";
import {
  BudgetIcon,
  CategoryIcon,
  DashboardIcon,
  ReportsIcon,
  SettingsIcon,
  TransactionsIcon,
  WalletIcon,
} from "@/components/icons";

export interface NavEntry {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  disabled?: boolean;
}

/**
 * Navigation for the application shell.
 *
 * Dashboard, transactions, accounts, categories, budgets, reports and settings
 * are real destinations. Budgets is enabled once its feature exists.
 */
export const navGroups: { title: string; items: NavEntry[] }[] = [
  {
    title: "عمومی",
    items: [
      {
        key: "dashboard",
        label: "داشبورد",
        href: "/",
        icon: <DashboardIcon />,
      },
    ],
  },
  {
    title: "مدیریت مالی",
    items: [
      {
        key: "transactions",
        label: "تراکنش‌ها",
        href: "/transactions",
        icon: <TransactionsIcon />,
      },
      {
        key: "accounts",
        label: "حساب‌ها",
        href: "/accounts",
        icon: <WalletIcon />,
      },
      {
        key: "categories",
        label: "دسته‌بندی‌ها",
        href: "/categories",
        icon: <CategoryIcon />,
      },
      { key: "budgets", label: "بودجه‌ها", href: "/budgets", icon: <BudgetIcon /> },
      {
        key: "reports",
        label: "گزارش‌ها",
        href: "/reports",
        icon: <ReportsIcon />,
      },
    ],
  },
  {
    title: "سیستم",
    items: [
      { key: "settings", label: "تنظیمات", href: "/settings", icon: <SettingsIcon /> },
    ],
  },
];

export const COMING_SOON_LABEL = "به‌زودی";

/**
 * Whether a navigation entry represents the current location. A destination is
 * active for its exact path and for any nested route beneath it (e.g.
 * `/transactions/new` keeps `/transactions` highlighted). Placeholders and the
 * root path never match a prefix.
 */
export function isNavEntryActive(
  entry: NavEntry,
  activePath?: string,
): boolean {
  if (entry.disabled || !entry.href || !activePath) return false;
  if (entry.href === activePath) return true;
  return entry.href !== "/" && activePath.startsWith(`${entry.href}/`);
}
