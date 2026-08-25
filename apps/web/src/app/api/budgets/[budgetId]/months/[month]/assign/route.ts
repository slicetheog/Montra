import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { assignMoney } from "@/server/services/budget";
import { parseMonthParam } from "@/server/month-param";

const schema = z.object({
  categoryId: z.string().min(1),
  amountCents: z.number().int(),
  memo: z.string().trim().max(280).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string; month: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    const body = schema.parse(await request.json());
    await assignMoney(user.id, budgetId, body.categoryId, parseMonthParam(month), body.amountCents, body.memo);
    return { ok: true };
  });
}
