import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { listReconciliations, reconcileAccount } from "@/server/services/reconciliation";

type Params = { params: Promise<{ budgetId: string; accountId: string }> };

const schema = z.object({ statementDate: z.coerce.date(), statementBalanceCents: z.number().int() });

export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    return listReconciliations(user.id, budgetId, accountId);
  });
}

export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, accountId } = await params;
    const body = schema.parse(await request.json());
    return reconcileAccount(user.id, budgetId, accountId, body.statementDate, body.statementBalanceCents);
  });
}
