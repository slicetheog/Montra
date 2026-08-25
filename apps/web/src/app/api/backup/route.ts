import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { exportBackup } from "@/server/services/backup";

export async function GET() {
  return handleApi(async () => {
    const user = await requireSessionUser();
    return exportBackup(user.id);
  });
}
