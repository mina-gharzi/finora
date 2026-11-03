import type {
  MobileCategoriesResponse,
  MobileCategoryRecord,
  MobileTransactionType,
} from "@finora/shared";
import { createCategory, listCategories } from "@/lib/finance/categories";
import {
  authenticateMobileRequest,
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

/**
 * GET /api/v1/categories
 *
 * The owner's categories, mapped to the public DTO so no owner id or internal
 * timestamp is exposed.
 */
export async function GET(request: Request) {
  const auth = await authenticateMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const categories = await listCategories(auth.userId);

  const response: MobileCategoriesResponse = {
    items: categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind as MobileTransactionType,
      archived: category.archived,
    })),
  };

  return mobileJson(response);
}

/**
 * POST /api/v1/categories
 *
 * Creates a category for the authenticated, verified owner.
 */
export async function POST(request: Request) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonObject(request);
  if (!body) {
    return mobileBadRequest();
  }

  const result = await createCategory(auth.userId, body);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson(toCategoryRecord(result.category), 201);
}
