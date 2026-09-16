import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createHolding, listHoldings } from "@/server/services/holdings";

type Params = { params: Promise<{ budgetId: string; accountId: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  symbol: z.string().trim().max(20).optional(),
  quantity: z.number().positive(),
  currentPriceCents: z.number().int().nonnegative(),
  costBasisCents: z.number().int().nonnegative().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    return listHoldings(user.id, budgetId, accountId);
  });
}

export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    const body = createSchema.parse(await request.json());
    return createHolding(user.id, budgetId, accountId, body);
  });
}
