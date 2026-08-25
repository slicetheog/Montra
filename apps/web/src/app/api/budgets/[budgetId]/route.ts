import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { archiveBudget, deleteBudget, renameBudget, requireBudgetOwnership } from "@/server/services/budgets";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isArchived: z.boolean().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return requireBudgetOwnership(budgetId, user.id);
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = patchSchema.parse(await request.json());
    let result = await requireBudgetOwnership(budgetId, user.id);
    if (body.name !== undefined) result = await renameBudget(user.id, budgetId, body.name);
    if (body.isArchived !== undefined) result = await archiveBudget(user.id, budgetId, body.isArchived);
    return result;
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    await deleteBudget(user.id, budgetId);
    return { ok: true };
  });
}
