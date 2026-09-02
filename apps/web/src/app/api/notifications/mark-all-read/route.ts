import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { markAllNotificationsRead } from "@/server/services/notifications";

export async function POST() {
  return handleApi(async () => {
    const user = await requireSessionUser();
    await markAllNotificationsRead(user.id);
    return { ok: true };
  });
}
