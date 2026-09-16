import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteHolding, updateHolding } from "@/server/services/holdings";

type Params = { params: Promise<{ budgetId: string; accountId: string; holdingId: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  symbol: z.string().trim().max(20).nullable().optional(),
  quantity: z.number().positive().optional(),
  currentPriceCents: z.number().int().nonnegative().optional(),
  costBasisCents: z.number().int().nonnegative().nullable().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId, holdingId } = await params;
    const body = updateSchema.parse(await request.json());
    return updateHolding(user.id, budgetId, accountId, holdingId, body);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId, holdingId } = await params;
    await deleteHolding(user.id, budgetId, accountId, holdingId);
    return { ok: true };
  });
}
