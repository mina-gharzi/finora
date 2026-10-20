import { Suspense } from "react";
import type { Metadata } from "next";
import { CategoriesView } from "@/components/categories/categories-view";
import { Spinner } from "@/components/ui/spinner";
import { requireUserId } from "@/lib/dal";
import { listCategories } from "@/lib/finance/categories";
import type { TransactionType } from "@/lib/finance/types";

export const metadata: Metadata = {
  title: "دسته‌بندی‌ها",
};

async function AuthenticatedCategories() {
  const userId = await requireUserId();
  const categories = await listCategories(userId);

  return (
    <CategoriesView
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind as TransactionType,
        archived: category.archived,
      }))}
    />
  );
}

function CategoriesFallback() {
  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center py-20">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<CategoriesFallback />}>
      <AuthenticatedCategories />
    </Suspense>
  );
}
