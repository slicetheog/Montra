import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { cancelImport } from "@/server/services/imports";

export async function POST(_request: Request, { params }: { params: Promise<{ budgetId: string; importId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, importId } = await params;
    await cancelImport(user.id, budgetId, importId);
    return { ok: true };
  });
}
