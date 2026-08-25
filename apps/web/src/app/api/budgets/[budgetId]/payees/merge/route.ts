import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { mergePayees } from "@/server/services/payees";

const schema = z.object({ sourcePayeeId: z.string().min(1), targetPayeeId: z.string().min(1) });

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = schema.parse(await request.json());
    await mergePayees(user.id, budgetId, body.sourcePayeeId, body.targetPayeeId);
    return { ok: true };
  });
}
