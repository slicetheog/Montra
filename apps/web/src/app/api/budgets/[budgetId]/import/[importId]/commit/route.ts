import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { commitImport } from "@/server/services/imports";

export async function POST(_request: Request, { params }: { params: Promise<{ budgetId: string; importId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, importId } = await params;
    return commitImport(user.id, budgetId, importId);
  });
}
