import { handleApi, ValidationError } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { categoryTrend } from "@/server/services/reports";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId");
    if (!categoryId) throw new ValidationError("categoryId is required.");
    const months = Number(url.searchParams.get("months") ?? 6);
    return categoryTrend(user.id, budgetId, categoryId, months);
  });
}
