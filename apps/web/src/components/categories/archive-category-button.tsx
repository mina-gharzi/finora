"use client";

import { useActionState, useState } from "react";
import { setCategoryArchivedAction } from "@/app/actions/categories";
import { EMPTY_ARCHIVE_CATEGORY_STATE } from "@/lib/categories-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export interface ArchiveCategoryButtonProps {
  categoryId: string;
  categoryName: string;
  archived: boolean;
}

/**
 * Archive/unarchive toggle for one category row. Archiving is state-changing but
 * reversible, so it uses the same inline two-step confirmation as account
 * archiving; unarchiving is purely restorative and happens on a single click.
 * Success and failure feedback is shown inline, and after a successful flip the
 * row re-renders with the opposite control (the action revalidates
 * `/categories`).
 */
export function ArchiveCategoryButton({
  categoryId,
  categoryName,
  archived,
}: ArchiveCategoryButtonProps) {
  const [state, formAction, isPending] = useActionState(
    setCategoryArchivedAction,
    EMPTY_ARCHIVE_CATEGORY_STATE,
  );
  const [confirming, setConfirming] = useState(false);

  if (archived) {
    return (
      <div className="flex flex-col items-end gap-2">
        {state.status === "error" && state.message && (
          <Alert variant="danger" className="w-full">
            {state.message}
          </Alert>
        )}
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="archived" value="false" />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={isPending}
            aria-label={`خروج از بایگانی دسته‌بندی ${categoryName}`}
          >
            خروج از بایگانی
          </Button>
        </form>
      </div>
    );
  }

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
          className="flex flex-wrap items-center gap-2"
          aria-label={`تأیید بایگانی دسته‌بندی ${categoryName}`}
        >
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="archived" value="true" />
          <span className="text-sm text-muted-foreground">
            بایگانی «{categoryName}»؟
          </span>
          <Button type="submit" variant="secondary" size="sm" loading={isPending}>
            تأیید بایگانی
          </Button>
          <Button
            type="button"
            variant="ghost"
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
          aria-label={`بایگانی دسته‌بندی ${categoryName}`}
        >
          بایگانی
        </Button>
      )}
    </div>
  );
}
