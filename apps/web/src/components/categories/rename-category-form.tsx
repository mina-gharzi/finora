"use client";

import { useActionState, useState } from "react";
import { renameCategoryAction } from "@/app/actions/categories";
import { EMPTY_CATEGORY_RENAME_STATE } from "@/lib/categories-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";

export interface RenameCategoryFormProps {
  categoryId: string;
  name: string;
}

/**
 * Inline rename control. It starts collapsed as a single "ویرایش" button and
 * expands into a small form when activated. The id is submitted as a hidden
 * field; ownership and `kind` are re-verified server-side, so this component
 * never trusts either. While a submission is pending the controls are disabled,
 * preventing duplicate writes.
 */
export function RenameCategoryForm({
  categoryId,
  name,
}: RenameCategoryFormProps) {
  const [state, formAction, isPending] = useActionState(
    renameCategoryAction,
    EMPTY_CATEGORY_RENAME_STATE,
  );
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {state.status === "error" && state.message && (
        <Alert variant="danger">{state.message}</Alert>
      )}
      {state.status === "success" && state.message && (
        <Alert variant="success">{state.message}</Alert>
      )}

      {editing ? (
        <form
          action={formAction}
          noValidate
          aria-label={`ویرایش نام دسته‌بندی ${name}`}
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
        >
          <input type="hidden" name="categoryId" value={categoryId} />
          <div className="flex-1">
            <TextField
              label="نام جدید"
              name="name"
              type="text"
              required
              maxLength={60}
              defaultValue={name}
              error={state.fieldErrors?.name}
            />
          </div>
          <div className="flex items-center gap-2 pt-0 sm:pt-6">
            <Button type="submit" size="sm" loading={isPending}>
              ذخیره
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              انصراف
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          aria-label={`ویرایش نام دسته‌بندی ${name}`}
        >
          ویرایش نام
        </Button>
      )}
    </div>
  );
}
