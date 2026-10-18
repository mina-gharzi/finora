import type { ReactNode } from "react";
import {
  BudgetIcon,
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
 * Placeholder navigation for the application shell.
 *
 * Only "داشبورد" (dashboard) is a real destination. Every other entry is an
 * intentionally disabled placeholder so the shell is demonstrated without
 * implying that those financial features already exist.
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
      { key: "budgets", label: "بودجه‌ها", icon: <BudgetIcon />, disabled: true },
      { key: "reports", label: "گزارش‌ها", icon: <ReportsIcon />, disabled: true },
    ],
  },
  {
    title: "سیستم",
    items: [
      { key: "settings", label: "تنظیمات", icon: <SettingsIcon />, disabled: true },
    ],
  },
];

export const COMING_SOON_LABEL = "به‌زودی";
