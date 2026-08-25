import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getDashboardSummary } from "@/server/services/dashboard";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return getDashboardSummary(user.id, budgetId);
  });
}
