import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createGoal, listGoals } from "@/server/services/goals";
import { createGoalSchema } from "@/server/validation/goals";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return listGoals(user.id, budgetId);
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = createGoalSchema.parse(await request.json());
    return createGoal(user.id, budgetId, body);
  });
}
