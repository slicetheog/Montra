import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { removeMember } from "@/server/services/budget-members";

type Params = { params: Promise<{ budgetId: string; memberId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, memberId } = await params;
    await removeMember(user.id, budgetId, memberId);
    return { ok: true };
  });
}
