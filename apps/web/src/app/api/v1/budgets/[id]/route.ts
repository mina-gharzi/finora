import type { MobileBudgetRecord } from "@finora/shared";
import { deleteBudget, updateBudget } from "@/lib/finance/budgets";
import {
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileBadRequest,
  mobileJson,
  readJsonObject,
} from "@/lib/mobile/http";

function toBudgetRecord(budget: {
  id: string;
  categoryId: string;
  monthStart: string;
  limitAmount: number;
}): MobileBudgetRecord {
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    monthStart: budget.monthStart,
    limitAmount: budget.limitAmount,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/v1/budgets/[id]
 *
 * Full replacement of an owned budget.
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const body = await readJsonObject(request);
  if (!body) {
    return mobileBadRequest();
  }

  const result = await updateBudget(auth.userId, id, body);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson(toBudgetRecord(result.budget));
}

/**
 * DELETE /api/v1/budgets/[id]
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const result = await deleteBudget(auth.userId, id);
  if (!result.ok) {
    return mapDomainFailure(result);
  }

  return mobileJson({ ok: true });
}
