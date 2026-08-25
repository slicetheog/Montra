import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteAccount, getAccount, updateAccount } from "@/server/services/accounts";
import { updateAccountSchema } from "@/server/validation/accounts";

type Params = { params: Promise<{ budgetId: string; accountId: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    return getAccount(user.id, budgetId, accountId);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    const body = updateAccountSchema.parse(await request.json());
    return updateAccount(user.id, budgetId, accountId, body);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    await deleteAccount(user.id, budgetId, accountId);
    return { ok: true };
  });
}
