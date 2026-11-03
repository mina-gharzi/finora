import type {
  MobileCategoriesResponse,
  MobileTransactionType,
} from "@finora/shared";
import { listCategories } from "@/lib/finance/categories";
import { authenticateMobileRequest, mobileJson } from "@/lib/mobile/http";

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
