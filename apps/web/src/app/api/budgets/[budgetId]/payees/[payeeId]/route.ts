import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { renamePayee, setPayeeDefaultCategory, suggestCategoryForPayee } from "@/server/services/payees";

type Params = { params: Promise<{ budgetId: string; payeeId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  defaultCategoryId: z.string().min(1).nullable().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    await requireSessionUser();
    const { budgetId, payeeId } = await params;
    const suggestedCategoryId = await suggestCategoryForPayee(budgetId, payeeId);
    return { suggestedCategoryId };
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, payeeId } = await params;
    const body = patchSchema.parse(await request.json());

    let result;
    if (body.name !== undefined) result = await renamePayee(user.id, budgetId, payeeId, body.name);
    if (body.defaultCategoryId !== undefined) {
      result = await setPayeeDefaultCategory(user.id, budgetId, payeeId, body.defaultCategoryId);
    }
    return result;
  });
}
