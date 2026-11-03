import { deleteTransfer } from "@/lib/finance/transfers";
import {
  authenticateVerifiedMobileRequest,
  mapDomainFailure,
  mobileJson,
} from "@/lib/mobile/http";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/v1/transfers/[id]
 *
 * Deletes an owned transfer; a missing/foreign id is the same 404.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await authenticateVerifiedMobileRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  const deleted = await deleteTransfer(auth.userId, id);
  if (!deleted) {
    return mapDomainFailure(false);
  }

  return mobileJson({ ok: true });
}
