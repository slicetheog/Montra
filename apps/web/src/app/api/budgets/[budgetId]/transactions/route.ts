import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createTransaction, listTransactions } from "@/server/services/transactions";
import { createTransactionSchema, listTransactionsQuerySchema } from "@/server/validation/transactions";

export async function GET(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const url = new URL(request.url);
    const query = listTransactionsQuerySchema.parse(Object.fromEntries(url.searchParams));
    return listTransactions(user.id, budgetId, query);
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = createTransactionSchema.parse(await request.json());
    return createTransaction(user.id, budgetId, body);
  });
}
