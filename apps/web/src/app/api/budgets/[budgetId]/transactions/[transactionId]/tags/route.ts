import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { setTransactionTags } from "@/server/services/tags";

const putSchema = z.object({ tagNames: z.array(z.string()).max(20) });

export async function PUT(request: Request, { params }: { params: Promise<{ budgetId: string; transactionId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, transactionId } = await params;
    const body = putSchema.parse(await request.json());
    await setTransactionTags(user.id, budgetId, transactionId, body.tagNames);
    return { ok: true };
  });
}
