import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getAutoAssignPlan, applyAutoAssignPlan } from "@/server/services/auto-assign";
import { resolveFirstDayOfMonth } from "@/server/services/settings";
import { parseMonthParam } from "@/server/month-param";

type Params = { params: Promise<{ budgetId: string; month: string }> };

/** Preview: the suggested plan for this period, computed fresh each call — nothing is written. */
export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    const firstDayOfMonth = await resolveFirstDayOfMonth(user.id);
    return getAutoAssignPlan(user.id, budgetId, parseMonthParam(month, firstDayOfMonth));
  });
}

const applySchema = z.object({
  lines: z.array(z.object({ categoryId: z.string().min(1), amountCents: z.number().int().positive() })),
});

/** Apply: assigns exactly the lines the client reviewed (a GET's own lines, normally), not a freshly recomputed plan. */
export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    const body = applySchema.parse(await request.json());
    const firstDayOfMonth = await resolveFirstDayOfMonth(user.id);
    return applyAutoAssignPlan(user.id, budgetId, parseMonthParam(month, firstDayOfMonth), body.lines);
  });
}
