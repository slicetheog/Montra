import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { archiveCategory, renameCategory } from "@/server/services/budget";

type Params = { params: Promise<{ budgetId: string; categoryId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isArchived: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, categoryId } = await params;
    const body = patchSchema.parse(await request.json());

    let result;
    if (body.name !== undefined) result = await renameCategory(user.id, budgetId, categoryId, body.name);
    if (body.isArchived) result = await archiveCategory(user.id, budgetId, categoryId);
    return result;
  });
}
