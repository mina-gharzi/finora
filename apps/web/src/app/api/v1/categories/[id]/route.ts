import type {
  MobileCategoryRecord,
  MobileTransactionType,
} from "@finora/shared";
import {
  deleteCategory,
  renameCategory,
  setCategoryArchived,
} from "@/lib/finance/categories";
import {
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileBadRequest,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";

function toCategoryRecord(category: {
  id: string;
  name: string;
  kind: string;
  archived: boolean;
}): MobileCategoryRecord {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind as MobileTransactionType,
    archived: category.archived,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/v1/categories/[id]
 *
 * Accepts exactly one of `{ name }` (rename) or `{ archived }` (archive).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return mobileBadRequest();
  }

  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasArchived = Object.prototype.hasOwnProperty.call(body, "archived");

  if (hasName === hasArchived) {
    return mobileBadRequest(
      "برای ویرایش دسته‌بندی دقیقاً یکی از نام یا وضعیت بایگانی را ارسال کنید.",
    );
  }

  if (hasName) {
    const result = await renameCategory(auth.userId, id, body);
    if (!result.ok) {
      return mapDomainFailure(result);
    }
    return mobileJson(toCategoryRecord(result.category));
  }

  if (typeof body.archived !== "boolean") {
    return mobileBadRequest();
  }

  const result = await setCategoryArchived(auth.userId, id, body.archived);
  if (!result.ok) {
    return mapDomainFailure(result);
  }
  return mobileJson(toCategoryRecord(result.category));
}

/**
 * DELETE /api/v1/categories/[id]
 *
 * Deletes an owned category. The domain refuses categories still referenced by
 * transactions and reports `has_transactions`.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const result = await deleteCategory(auth.userId, id);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson({ ok: true });
}
