import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { suggestRecurringTransactions } from "@/server/services/recurring";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return suggestRecurringTransactions(user.id, budgetId);
  });
}
