import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteTransaction, getTransaction, updateTransaction } from "@/server/services/transactions";
import { updateTransactionSchema } from "@/server/validation/transactions";

type Params = { params: Promise<{ budgetId: string; transactionId: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, transactionId } = await params;
    return getTransaction(user.id, budgetId, transactionId);
  });
}

export async function PATCH(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, transactionId } = await params;
    const body = updateTransactionSchema.parse(await request.json());
    return updateTransaction(user.id, budgetId, transactionId, body);
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, transactionId } = await params;
    await deleteTransaction(user.id, budgetId, transactionId);
    return { ok: true };
  });
}
