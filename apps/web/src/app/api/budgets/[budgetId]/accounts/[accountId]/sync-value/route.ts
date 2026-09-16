import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { syncAccountValueToHoldings } from "@/server/services/holdings";

type Params = { params: Promise<{ budgetId: string; accountId: string }> };

export async function POST(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    return syncAccountValueToHoldings(user.id, budgetId, accountId);
  });
}
