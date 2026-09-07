import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { moveMoney } from "@/server/services/budget";
import { resolveFirstDayOfMonth } from "@/server/services/settings";
import { parseMonthParam } from "@/server/month-param";

const schema = z.object({
  fromCategoryId: z.string().min(1),
  toCategoryId: z.string().min(1),
  amountCents: z.number().int().positive(),
});

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string; month: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    const body = schema.parse(await request.json());
    const firstDayOfMonth = await resolveFirstDayOfMonth(user.id);
    await moveMoney(user.id, budgetId, body.fromCategoryId, body.toCategoryId, parseMonthParam(month, firstDayOfMonth), body.amountCents);
    return { ok: true };
  });
}
