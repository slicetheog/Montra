import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getDebtSummary } from "@/server/services/debts";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return getDebtSummary(user.id, budgetId);
  });
}
