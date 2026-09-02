import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getDebtStrategyComparison } from "@/server/services/debts";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const extraMonthlyCents = Number(url.searchParams.get("extraMonthlyCents") ?? 0);
    return getDebtStrategyComparison(user.id, budgetId, Number.isFinite(extraMonthlyCents) ? extraMonthlyCents : 0);
  });
}
