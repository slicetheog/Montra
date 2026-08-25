import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { spendingByCategory } from "@/server/services/reports";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return spendingByCategory(user.id, budgetId, { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined });
  });
}
