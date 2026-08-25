import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { incomeVsExpense } from "@/server/services/reports";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const months = Number(url.searchParams.get("months") ?? 6);
    return incomeVsExpense(user.id, budgetId, months);
  });
}
