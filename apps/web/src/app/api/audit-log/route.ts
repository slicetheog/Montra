import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { listAuditLog } from "@/server/services/audit";

export async function GET() {
  return handleApi(async () => {
    const user = await requireSessionUser();
    return listAuditLog(user.id);
  });
}
