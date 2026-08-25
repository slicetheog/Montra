import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getMonthView } from "@/server/services/budget";
import { parseMonthParam } from "@/server/month-param";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string; month: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    return getMonthView(user.id, budgetId, parseMonthParam(month));
  });
}
