import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getCashFlowForecast } from "@/server/services/cash-flow";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const horizonDays = Number(url.searchParams.get("horizonDays") ?? 60);
    return getCashFlowForecast(user.id, budgetId, horizonDays);
  });
}
