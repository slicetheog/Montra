import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getImportPreview } from "@/server/services/imports";

export async function GET(_request: Request, { params }: { params: Promise<{ budgetId: string; importId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, importId } = await params;
    return getImportPreview(user.id, budgetId, importId);
  });
}
