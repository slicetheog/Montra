import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createAccount, listAccounts } from "@/server/services/accounts";
import { createAccountSchema } from "@/server/validation/accounts";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return listAccounts(user.id, budgetId);
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = createAccountSchema.parse(await request.json());
    return createAccount(user.id, budgetId, body);
  });
}
