import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { logRecurringPayment } from "@/server/services/recurring";
import { logRecurringPaymentSchema } from "@/server/validation/recurring";

type Params = { params: Promise<{ budgetId: string; recurringId: string }> };

export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, recurringId } = await params;
    const body = logRecurringPaymentSchema.parse(await request.json());
    return logRecurringPayment(user.id, budgetId, recurringId, body);
  });
}
