import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { updateUserSettings } from "@/server/services/settings";
import { updateSettingsSchema } from "@/server/validation/settings";

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const body = updateSettingsSchema.parse(await request.json());
    return updateUserSettings(user.id, body);
  });
}
