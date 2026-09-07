import { z } from "zod";
import { prisma } from "@montra/db";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { findOrCreateTag, listTags } from "@/server/services/tags";

const createSchema = z.object({ name: z.string().trim().min(1).max(40) });

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return listTags(user.id, budgetId);
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    await requireBudgetOwnership(budgetId, user.id);
    const body = createSchema.parse(await request.json());
    return findOrCreateTag(prisma, budgetId, body.name);
  });
}
