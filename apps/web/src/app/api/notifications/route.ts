import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { generateNotifications, listNotifications } from "@/server/services/notifications";

export async function GET() {
  return handleApi(async () => {
    const user = await requireSessionUser();
    await generateNotifications(user.id);
    return listNotifications(user.id);
  });
}
