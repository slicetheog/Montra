import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createCategory, listCategories, reorderCategories } from "@/server/services/budget";

const createSchema = z.object({ groupId: z.string().min(1), name: z.string().trim().min(1).max(80) });
const reorderSchema = z.object({
  updates: z.array(
    z.object({ categoryId: z.string().min(1), groupId: z.string().min(1), sortOrder: z.number().int() }),
  ),
});

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return listCategories(user.id, budgetId);
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = createSchema.parse(await request.json());
    return createCategory(user.id, budgetId, body.groupId, body.name);
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = reorderSchema.parse(await request.json());
    await reorderCategories(user.id, budgetId, body.updates);
    return { ok: true };
  });
}
