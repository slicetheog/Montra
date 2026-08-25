import { z } from "zod";
import { handleApi, ForbiddenError, NotFoundError } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { logAudit } from "@/server/services/audit";
import { prisma } from "@montra/db";

type Params = { params: Promise<{ budgetId: string; groupId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isArchived: z.boolean().optional(),
});

async function requireGroupInBudget(groupId: string, budgetId: string) {
  const group = await prisma.categoryGroup.findUnique({ where: { id: groupId } });
  if (!group || group.budgetId !== budgetId) throw new NotFoundError("That category group couldn't be found.");
  return group;
}

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, groupId } = await params;
    await requireBudgetOwnership(budgetId, user.id);
    const group = await requireGroupInBudget(groupId, budgetId);
    if (group.isSystem) throw new ForbiddenError("This group is managed automatically.");

    const body = patchSchema.parse(await request.json());
    const updated = await prisma.categoryGroup.update({ where: { id: groupId }, data: body });
    await logAudit({ userId: user.id, action: "category_group.updated", entityType: "CategoryGroup", entityId: groupId });
    return updated;
  });
}
