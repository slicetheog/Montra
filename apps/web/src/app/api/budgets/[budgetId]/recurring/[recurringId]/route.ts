import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteRecurring, updateRecurring } from "@/server/services/recurring";
import { updateRecurringSchema } from "@/server/validation/recurring";

type Params = { params: Promise<{ budgetId: string; recurringId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, recurringId } = await params;
    const body = updateRecurringSchema.parse(await request.json());
    return updateRecurring(user.id, budgetId, recurringId, body);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, recurringId } = await params;
    await deleteRecurring(user.id, budgetId, recurringId);
    return { ok: true };
  });
}
