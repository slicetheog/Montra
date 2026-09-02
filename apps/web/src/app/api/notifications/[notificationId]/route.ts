import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { markNotificationRead } from "@/server/services/notifications";

export async function PATCH(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { notificationId } = await params;
    await markNotificationRead(user.id, notificationId);
    return { ok: true };
  });
}
