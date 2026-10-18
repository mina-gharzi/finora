"use client";

import { useActionState, useState } from "react";
import { deleteCategoryAction } from "@/app/actions/categories";
import { EMPTY_DELETE_CATEGORY_STATE } from "@/lib/categories-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface DeleteCategoryButtonProps {
  categoryId: string;
  categoryName: string;
}

/**
 * Delete control with an inline confirmation step. The id is submitted as a
 * hidden field; ownership and the "no referencing transactions" rule are
 * re-verified server-side, so this component never needs to trust them. While a
 * submission is pending the confirm button shows a busy state and cancel is
 * disabled, preventing duplicate deletions.
 */
export function DeleteCategoryButton({
  categoryId,
  categoryName,
}: DeleteCategoryButtonProps) {
  const [state, formAction, isPending] = useActionState(
    deleteCategoryAction,
    EMPTY_DELETE_CATEGORY_STATE,
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {state.status === "error" && state.message && (
        <Alert variant="danger" className="w-full">
          {state.message}
        </Alert>
      )}
      {confirming ? (
        <form
          action={formAction}
          className="flex flex-wrap items-center justify-end gap-2"
          aria-label={`تأیید حذف دسته‌بندی ${categoryName}`}
        >
          <input type="hidden" name="categoryId" value={categoryId} />
          <span className="text-sm text-muted-foreground">
            حذف «{categoryName}»؟
          </span>
          <Button type="submit" variant="danger" size="sm" loading={isPending}>
            تأیید حذف
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            انصراف
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          aria-label={`حذف دسته‌بندی ${categoryName}`}
        >
          حذف
        </Button>
      )}
    </div>
  );
}
