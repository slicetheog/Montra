import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteTag } from "@/server/services/tags";

export async function DELETE(_request: Request, { params }: { params: Promise<{ budgetId: string; tagId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, tagId } = await params;
    await deleteTag(user.id, budgetId, tagId);
    return { ok: true };
  });
}
