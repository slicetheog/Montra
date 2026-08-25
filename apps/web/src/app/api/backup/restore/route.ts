import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { restoreBackup } from "@/server/services/backup";

export async function POST(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const body = await request.json();
    return restoreBackup(user.id, body);
  });
}
