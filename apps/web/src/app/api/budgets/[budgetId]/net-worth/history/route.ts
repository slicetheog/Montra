import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getNetWorthHistory } from "@/server/services/net-worth";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const months = Number(url.searchParams.get("months") ?? 12);
    return getNetWorthHistory(user.id, budgetId, months);
  });
}
