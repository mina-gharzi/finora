"use client";

import {
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CategoryIcon } from "@/components/icons";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { TRANSACTION_TYPE_LABELS } from "@/lib/finance/transaction-labels";
import { TRANSACTION_TYPES, type TransactionType } from "@/lib/finance/types";
import { CreateCategoryForm } from "./create-category-form";
import { DeleteCategoryButton } from "./delete-category-button";
import { RenameCategoryForm } from "./rename-category-form";

/** Minimal category shape exposed to the client (no owner id or timestamps). */
export interface CategoryItem {
  id: string;
  name: string;
  kind: TransactionType;
}

export interface CategoriesViewProps {
  categories: CategoryItem[];
}

const PANEL_ID = "categories-panel";

const KIND_BADGE: Record<TransactionType, BadgeVariant> = {
  income: "success",
  expense: "danger",
};

function emptyTitle(kind: TransactionType): string {
  return kind === "income"
    ? "هنوز دسته‌بندی درآمدی ثبت نشده است"
    : "هنوز دسته‌بندی هزینه‌ای ثبت نشده است";
}

/**
 * Presentational category-management view. It distinguishes income from expense
 * categories with an accessible tab list (`role="tablist"`) and renders the
 * matching list, per-type empty state and management controls. It holds no
 * session or data-fetching concerns so it can be unit tested.
 */
export function CategoriesView({ categories }: CategoriesViewProps) {
  const [activeKind, setActiveKind] = useState<TransactionType>("expense");

  const byKind: Record<TransactionType, CategoryItem[]> = {
    income: categories.filter((category) => category.kind === "income"),
    expense: categories.filter((category) => category.kind === "expense"),
  };
  const visible = byKind[activeKind];

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const current = TRANSACTION_TYPES.indexOf(activeKind);
      let next: number | null = null;

      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        next = (current + 1) % TRANSACTION_TYPES.length;
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        next = (current - 1 + TRANSACTION_TYPES.length) % TRANSACTION_TYPES.length;
      } else if (event.key === "Home") {
        next = 0;
      } else if (event.key === "End") {
        next = TRANSACTION_TYPES.length - 1;
      }

      if (next === null) return;
      event.preventDefault();
      setActiveKind(TRANSACTION_TYPES[next]);
    },
    [activeKind],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">دسته‌بندی‌ها</h1>
        <p className="text-sm text-muted-foreground">
          دسته‌بندی‌های درآمد و هزینه خود را مدیریت کنید.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>افزودن دسته‌بندی</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCategoryForm />
        </CardContent>
      </Card>

      <section
        aria-labelledby="categories-list-title"
        className="flex flex-col gap-3"
      >
        <h2
          id="categories-list-title"
          className="text-lg font-semibold text-foreground"
        >
          دسته‌بندی‌های شما
        </h2>

        <div
          role="tablist"
          aria-label="نوع دسته‌بندی"
          onKeyDown={handleTabKeyDown}
          className="flex gap-1 rounded-lg border border-border bg-surface p-1"
        >
          {TRANSACTION_TYPES.map((kind) => {
            const selected = kind === activeKind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                id={`categories-tab-${kind}`}
                aria-selected={selected}
                aria-controls={PANEL_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveKind(kind)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  selected
                    ? "bg-primary-subtle text-primary"
                    : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                )}
              >
                {TRANSACTION_TYPE_LABELS[kind]}
                <Badge variant={KIND_BADGE[kind]}>{byKind[kind].length}</Badge>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={`categories-tab-${activeKind}`}
          className="flex flex-col gap-3"
        >
          {visible.length === 0 ? (
            <EmptyState
              icon={<CategoryIcon width={24} height={24} />}
              title={emptyTitle(activeKind)}
              description="با فرم بالا اولین دسته‌بندی را برای این نوع اضافه کنید."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {visible.map((category) => (
                <li key={category.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-foreground">
                          {category.name}
                        </span>
                        <Badge variant={KIND_BADGE[category.kind]}>
                          {TRANSACTION_TYPE_LABELS[category.kind]}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
                        <RenameCategoryForm
                          categoryId={category.id}
                          name={category.name}
                        />
                        <DeleteCategoryButton
                          categoryId={category.id}
                          categoryName={category.name}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
