import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteGoal, updateGoal } from "@/server/services/goals";
import { updateGoalSchema } from "@/server/validation/goals";

type Params = { params: Promise<{ budgetId: string; goalId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, goalId } = await params;
    const body = updateGoalSchema.parse(await request.json());
    return updateGoal(user.id, budgetId, goalId, body);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, goalId } = await params;
    await deleteGoal(user.id, budgetId, goalId);
    return { ok: true };
  });
}
