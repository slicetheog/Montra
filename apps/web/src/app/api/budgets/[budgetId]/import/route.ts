import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { stageImport } from "@/server/services/imports";
import { stageImportSchema } from "@/server/validation/imports";

export async function POST(request: Request, { params }: { params: Promise<{ budgetId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = stageImportSchema.parse(await request.json());
    return stageImport(user.id, budgetId, body.accountId, body.filename, body.rows);
  });
}
