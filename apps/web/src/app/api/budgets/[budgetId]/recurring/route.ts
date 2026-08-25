import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createRecurring, listRecurring } from "@/server/services/recurring";
import { createRecurringSchema } from "@/server/validation/recurring";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return listRecurring(user.id, budgetId);
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = createRecurringSchema.parse(await request.json());
    return createRecurring(user.id, budgetId, body);
  });
}
