import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { upsertDebtDetails } from "@/server/services/debts";

const schema = z.object({
  originalBalanceCents: z.number().int().nonnegative(),
  interestRateBps: z.number().int().min(0).max(10000),
  minimumPaymentCents: z.number().int().nonnegative(),
  dueDayOfMonth: z.number().int().min(1).max(28).optional(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ budgetId: string; accountId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    const body = schema.parse(await request.json());
    return upsertDebtDetails(user.id, budgetId, accountId, body);
  });
}
