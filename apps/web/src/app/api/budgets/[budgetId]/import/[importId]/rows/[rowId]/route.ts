import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { updateImportRow } from "@/server/services/imports";
import { updateImportRowSchema } from "@/server/validation/imports";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ budgetId: string; importId: string; rowId: string }> },
) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, importId, rowId } = await params;
    const body = updateImportRowSchema.parse(await request.json());
    return updateImportRow(user.id, budgetId, importId, rowId, body);
  });
}
