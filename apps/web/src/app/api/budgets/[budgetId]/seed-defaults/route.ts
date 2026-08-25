import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { seedDefaultCategories } from "@/server/services/budgets";

export async function POST(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    await seedDefaultCategories(user.id, budgetId);
    return { ok: true };
  });
}
